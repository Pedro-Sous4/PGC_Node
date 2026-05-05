import { IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ErrorDto {
  @IsOptional()
  @IsString()
  credorSlug?: string;

  @IsString()
  code!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  technicalDetail?: string;
}

class CredorUpdateDto {
  @IsString()
  credorSlug!: string;

  @IsIn(['PENDING', 'PROCESSING', 'SUCCESS', 'ERROR'])
  state!: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

  @IsOptional()
  @IsString()
  credorName?: string;

  @IsOptional()
  @IsString()
  numeroPgc?: string;

  @IsOptional()
  @IsString()
  periodo?: string;

  @IsOptional()
  @IsNumber()
  valorTotal?: number;

  @IsOptional()
  @IsString()
  flow?: string;

  @IsOptional()
  @IsString()
  warning?: string;
}

class ArtifactDto {
  @IsIn(['CSV', 'XLSX', 'ZIP', 'PDF'])
  type!: 'CSV' | 'XLSX' | 'ZIP' | 'PDF';

  @IsString()
  path!: string;
}

export class InternalProgressDto {
  @IsString()
  stage!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  percent!: number;

  @IsOptional()
  @IsIn(['PROCESSING', 'SUCCESS', 'ERROR'])
  status?: 'PROCESSING' | 'SUCCESS' | 'ERROR';

  @IsOptional()
  @IsString()
  currentCredor?: string;

  @IsOptional()
  @IsNumber()
  successCount?: number;

  @IsOptional()
  @IsNumber()
  errorCount?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ErrorDto)
  appendError?: ErrorDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CredorUpdateDto)
  credorUpdate?: CredorUpdateDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ArtifactDto)
  appendArtifact?: ArtifactDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expectedCredores?: string[];
}
