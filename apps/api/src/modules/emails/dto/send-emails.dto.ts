import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class SendEmailsDto {
  @IsOptional()
  @IsString()
  grupoId?: string;

  @IsString()
  numero_pgc!: string;

  @IsIn(['todos', 'credor', 'empresa'])
  escopo!: 'todos' | 'credor' | 'empresa';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  credorIds?: string[];

  @IsOptional()
  @IsString()
  empresa_nome_curto?: string;
}
