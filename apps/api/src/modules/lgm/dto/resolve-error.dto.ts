import { IsIn, IsOptional, IsString } from 'class-validator';

export class ResolveErrorDto {
  @IsIn(['resolve', 'ignore'])
  action!: 'resolve' | 'ignore';

  @IsOptional()
  @IsString()
  note?: string;
}
