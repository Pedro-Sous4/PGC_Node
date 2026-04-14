import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

class EmpresaCnpjItemDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  empresa?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  apelido?: string;

  @IsOptional()
  @IsString()
  @MinLength(14)
  cnpj?: string;
}

class EmailSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  fromName?: string;

  @IsOptional()
  @IsEmail()
  fromAddress?: string;

  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  assuntoPadrao?: string;
}

class EnvioSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  loteMaximoCredores?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  intervaloMsEntreEnvios?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxTentativasPorCredor?: number;
}

class ProcessamentoSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(3600000)
  timeoutMsIngestao?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(3600000)
  timeoutMsCredor?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(3600000)
  timeoutMsArtefatos?: number;
}

class SmtpSettingsDto {
  @IsOptional()
  @IsIn(['smtp', 'sendgrid-smtp'])
  provider?: 'smtp' | 'sendgrid-smtp';

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  pass?: string;

  @IsOptional()
  @IsString()
  sendgridApiKey?: string;

  @IsOptional()
  @IsEmail()
  testTo?: string;
}

export class UpdateSystemSettingsDto {
  @IsOptional()
  email?: EmailSettingsDto;

  @IsOptional()
  envio?: EnvioSettingsDto;

  @IsOptional()
  processamento?: ProcessamentoSettingsDto;

  @IsOptional()
  smtp?: SmtpSettingsDto;

  @IsOptional()
  empresasCnpj?: EmpresaCnpjItemDto[];

  @IsOptional()
  @IsString()
  @MinLength(2)
  auditActor?: string;
}
