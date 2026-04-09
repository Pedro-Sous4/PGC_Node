import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { UploadsService } from './application/uploads.service';
import { UploadsController } from './uploads.controller';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, PrismaService],
})
export class UploadsModule {}
