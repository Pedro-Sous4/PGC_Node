import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { EmailsController } from './emails.controller';
import { EmailsService } from './application/emails.service';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [SystemSettingsModule],
  controllers: [EmailsController],
  providers: [EmailsService, PrismaService],
})
export class EmailsModule {}
