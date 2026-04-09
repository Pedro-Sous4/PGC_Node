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

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
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
      },
    });

    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      created_at: user.created_at,
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.appUser.findUnique({ where: { email } });
    if (!user || !user.active) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    const ok = await compare(dto.senha, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciais invalidas.');
    }

    await this.prisma.appUser.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    const access_token = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      access_token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
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

  logout() {
    return { logged_out: true };
  }
}
