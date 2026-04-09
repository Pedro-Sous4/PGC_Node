import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { EmpresasPagadorasController } from './empresas-pagadoras.controller';
import { EmpresasPagadorasService } from './application/empresas-pagadoras.service';

@Module({
  controllers: [EmpresasPagadorasController],
  providers: [EmpresasPagadorasService, PrismaService],
})
export class EmpresasPagadorasModule {}
