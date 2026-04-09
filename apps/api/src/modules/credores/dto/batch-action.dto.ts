import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class BatchActionDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}
