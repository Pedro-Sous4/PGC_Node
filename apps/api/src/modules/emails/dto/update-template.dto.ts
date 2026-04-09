import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateTemplateDto {
  @IsString()
  @IsNotEmpty()
  mensagem_principal!: string;

  @IsString()
  texto_minimo!: string;

  @IsString()
  texto_descontos!: string;
}
