import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateEmpresaPagadoraDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nome_curto!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  nome_completo!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9./-]{14,18}$/)
  cnpj?: string;
}
