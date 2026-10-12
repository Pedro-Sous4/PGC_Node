import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateHistoricoDto {
  @IsOptional()
  @IsString()
  empresa?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  carryoverAnterior?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  descontoTotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  descontoAplicado?: number;

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  restanteProximoPgc?: number;
}
