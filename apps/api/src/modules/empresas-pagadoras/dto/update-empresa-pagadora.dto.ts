import { PartialType } from '@nestjs/swagger';
import { CreateEmpresaPagadoraDto } from './create-empresa-pagadora.dto';

export class UpdateEmpresaPagadoraDto extends PartialType(CreateEmpresaPagadoraDto) {}
