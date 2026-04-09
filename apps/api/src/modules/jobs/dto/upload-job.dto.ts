import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class UploadJobDto {
  @ApiProperty({ example: 'lgm', description: 'Tipo de fluxo de processamento' })
  @IsString()
  flow!: 'classic' | 'lgm' | 'laghetto-sports';

  @ApiProperty({
    required: false,
    example: ['credor-a', 'credor-b'],
    description: 'Subset opcional de credores para reprocessamento',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  credores?: string[];
}
