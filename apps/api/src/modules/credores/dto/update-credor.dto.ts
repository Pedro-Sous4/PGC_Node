import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';
import { CreateCredorDto } from './create-credor.dto';

export class UpdateCredorDto extends PartialType(CreateCredorDto) {
  @IsOptional()
  @IsBoolean()
  enviado?: boolean;

  @IsOptional()
  @IsDateString()
  data_envio?: string;
}
