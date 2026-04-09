import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateRendimentoDto {
  @IsString()
  @IsNotEmpty()
  credorId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  numero_pgc!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  referencia!: string;

  @IsString()
  @IsNotEmpty()
  valor!: string;
}
