import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListCredoresQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number = 20;

  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  grupoId?: string;

  @IsOptional()
  @IsString()
  periodo?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  enviado?: boolean;


  @IsOptional()
  @IsString()
  numero_pgc?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'sim' || value === 'true' || value === true) return true;
    if (value === 'nao' || value === 'false' || value === false) return false;
    return undefined;
  })
  hasMinimo?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'sim' || value === 'true' || value === true) return true;
    if (value === 'nao' || value === 'false' || value === false) return false;
    return undefined;
  })
  hasDesconto?: boolean;

  @IsOptional()
  @IsIn(['nomeExibivel', 'email', 'periodo', 'enviado', 'created_at'])
  orderBy?: 'nomeExibivel' | 'email' | 'periodo' | 'enviado' | 'created_at' = 'nomeExibivel';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'asc';
}
