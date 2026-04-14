import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  mensagem_principal?: string;

  @IsString()
  @IsNotEmpty()
  mensagem_laghetto_golden!: string;

  @IsString()
  @IsNotEmpty()
  mensagem_laghetto_sports!: string;

  @IsString()
  texto_minimo!: string;

  @IsString()
  texto_descontos!: string;
}
