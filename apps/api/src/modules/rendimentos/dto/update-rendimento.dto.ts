import { PartialType } from '@nestjs/swagger';
import { CreateRendimentoDto } from './create-rendimento.dto';

export class UpdateRendimentoDto extends PartialType(CreateRendimentoDto) {}
