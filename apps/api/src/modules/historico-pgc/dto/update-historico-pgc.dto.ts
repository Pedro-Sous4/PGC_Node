import { IsOptional, IsString } from 'class-validator';

export class UpdateHistoricoPgcDto {
  @IsOptional()
  @IsString()
  numero_pgc?: string;

  @IsOptional()
  @IsString()
  periodo?: string;

  @IsOptional()
  @IsString()
  evento?: string;
}
