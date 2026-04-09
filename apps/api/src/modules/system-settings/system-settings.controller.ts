import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SystemSettingsService } from './application/system-settings.service';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { TestEmailSettingsDto } from './dto/test-email-settings.dto';

@ApiTags('system-settings')
@Controller('system-settings')
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
