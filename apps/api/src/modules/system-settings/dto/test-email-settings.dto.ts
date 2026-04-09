import { IsEmail, IsOptional } from 'class-validator';

export class TestEmailSettingsDto {
  @IsOptional()
  @IsEmail()
  to?: string;
}
