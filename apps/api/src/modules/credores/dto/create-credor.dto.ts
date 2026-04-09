import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCredorDto {
  @IsString()
  @MaxLength(180)
  nome!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  periodo?: string;

  @IsOptional()
  @IsString()
  grupoId?: string;

  @IsOptional()
  @IsBoolean()
  allow_protected_update?: boolean;
}
