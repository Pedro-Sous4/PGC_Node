import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ReprocessJobDto {
  @ApiProperty({ example: ['credor-a'], description: 'Credores para reprocessar' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  credores!: string[];
}
