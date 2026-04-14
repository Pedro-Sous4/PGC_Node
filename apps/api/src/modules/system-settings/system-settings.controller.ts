import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SystemSettingsService } from './application/system-settings.service';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { TestEmailSettingsDto } from './dto/test-email-settings.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('system-settings')
@Controller('system-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get()
  get() {
    return this.service.getSettings();
  }

  @Put()
  update(@Body() dto: UpdateSystemSettingsDto) {
    return this.service.updateSettings(dto);
  }

  @Post('test-email')
  testEmail(@Body() dto: TestEmailSettingsDto) {
    return this.service.sendTestEmail(dto.to);
  }
}
