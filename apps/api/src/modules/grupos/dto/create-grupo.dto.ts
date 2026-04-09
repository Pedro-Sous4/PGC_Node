import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateGrupoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nome!: string;
}
