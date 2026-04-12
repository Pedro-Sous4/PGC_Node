import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: any) {
    const existing = await this.prisma.appUser.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('E-mail ja cadastrado.');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.appUser.create({
      data: {
        nome: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role as Role,
        active: true,
      },
    });
  }

  async listAll() {
    return this.prisma.appUser.findMany({
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        active: true,
        provider: true,
        created_at: true,
        last_login_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async updateStatus(id: string, active: boolean) {
    const user = await this.prisma.appUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario nao encontrado.');

    return this.prisma.appUser.update({
      where: { id },
      data: { active },
    });
  }

  async updateRole(id: string, role: Role) {
    const user = await this.prisma.appUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario nao encontrado.');

    return this.prisma.appUser.update({
      where: { id },
      data: { role },
    });
  }

  async deleteUser(id: string) {
    const user = await this.prisma.appUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario nao encontrado.');
    
    // Nao permitir deletar a si mesmo ou o ultimo admin seria bom, 
    // mas por enquanto vamos deixar basico
    return this.prisma.appUser.delete({ where: { id } });
  }
}
