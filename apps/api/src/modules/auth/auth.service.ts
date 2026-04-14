import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../infra/prisma.service';
import { compare, hash } from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestResetDto } from './dto/request-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SystemSettingsService } from '../system-settings/application/system-settings.service';
import * as nodemailer from 'nodemailer';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly settingsService: SystemSettingsService,
  ) {}

  async signup(dto: SignupDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.appUser.findUnique({ where: { email } });
    if (exists) {
      throw new BadRequestException('E-mail ja cadastrado.');
    }

    const passwordHash = await hash(dto.senha, 10);
    const user = await this.prisma.appUser.create({
      data: {
        nome: dto.nome.trim(),
        email,
        passwordHash,
        active: false, // Novos usuários nascem inativos
        role: 'CONSULTA', // Novos usuários nascem como consulta
      },
    });

    // Notificar admin
    void this.notifyAdminOfNewSignup(user.nome, user.email);

    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      active: user.active,
      created_at: user.created_at,
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.appUser.findUnique({ where: { email } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Esta conta utiliza login social. Utilize Google ou Microsoft para entrar.');
    }

    const ok = await compare(dto.senha, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    if (!user.active) {
      throw new UnauthorizedException('Sua conta aguarda autorizacao do administrador.');
    }

    await this.prisma.appUser.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    const access_token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      access_token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        active: true,
        created_at: true,
        last_login_at: true,
      },
    });

    if (!user) throw new NotFoundException('Usuario nao encontrado.');
    return user;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario nao encontrado.');

    if (!user.passwordHash) {
      throw new UnauthorizedException('Esta conta utiliza login social. Nao e possivel alterar a senha por aqui.');
    }

    const ok = await compare(dto.senhaAtual, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Senha atual invalida.');
    }

    const passwordHash = await hash(dto.novaSenha, 10);
    await this.prisma.appUser.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { changed: true };
  }

  async requestPasswordReset(dto: RequestResetDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.appUser.findUnique({ where: { email } });

    if (!user) {
      return { accepted: true };
    }

    const rawToken = randomBytes(24).toString('hex');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accepted: true,
      reset_token_dev: rawToken,
      expires_at: expiresAt.toISOString(),
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = sha256(dto.token);
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!token || token.usedAt || token.expiresAt < new Date()) {
      throw new BadRequestException('Token invalido ou expirado.');
    }

    const passwordHash = await hash(dto.novaSenha, 10);

    await this.prisma.$transaction([
      this.prisma.appUser.update({
        where: { id: token.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { reset: true };
  }

  async validateOAuthUser(socialUser: { email: string; name: string; provider: string; providerId: string }) {
    const email = socialUser.email.toLowerCase();
    
    let user = await this.prisma.appUser.findUnique({ where: { email } });

    if (!user) {
      // Criar novo usuário via social (nasce inativo)
      user = await this.prisma.appUser.create({
        data: {
          email,
          nome: socialUser.name,
          provider: socialUser.provider,
          providerId: socialUser.providerId,
          active: false,
          role: 'CONSULTA',
        },
      });

      // Notificar admin
      void this.notifyAdminOfNewSignup(user.nome, user.email);
    } else {
      // Já existe. Vincular se não tiver provider
      if (!user.provider) {
        user = await this.prisma.appUser.update({
          where: { id: user.id },
          data: {
            provider: socialUser.provider,
            providerId: socialUser.providerId,
          },
        });
      }
    }

    if (!user.active) {
      // Retornamos o usuário mas sinalizamos que não está ativo. 
      // O controller deve redirecionar para uma página de erro/aviso.
      return { user, active: false };
    }

    await this.prisma.appUser.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    const access_token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { access_token, user, active: true };
  }

  logout() {
    return { logged_out: true };
  }

  private async notifyAdminOfNewSignup(nome: string, email: string) {
    try {
      const settings = await this.settingsService.getSettings();
      const adminEmail = settings.smtp.testTo || settings.email.replyTo || settings.email.fromAddress;

      if (!adminEmail || !settings.smtp.host) return;

      const transporter = nodemailer.createTransport({
        host: settings.smtp.host,
        port: settings.smtp.port,
        secure: settings.smtp.secure,
        auth: settings.smtp.user && settings.smtp.pass ? { user: settings.smtp.user, pass: settings.smtp.pass } : undefined,
      });

      const fromLabel = settings.email.fromAddress
        ? `${settings.email.fromName} <${settings.email.fromAddress}>`
        : settings.email.fromName;

      await transporter.sendMail({
        from: fromLabel,
        to: adminEmail,
        subject: '[PGC] Novo cadastro aguardando autorização',
        text: `Olá,\n\nUm novo usuário se cadastrou no sistema PGC e aguarda autorização:\n\nNome: ${nome}\nE-mail: ${email}\n\nPara autorizar, acesse o painel de Configurações -> Gestão de Usuários.`,
      });
    } catch (error) {
      console.error('Falha ao notificar admin de novo signup:', error);
    }
  }
}
