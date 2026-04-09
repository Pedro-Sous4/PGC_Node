import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EmpresasPagadorasService } from './application/empresas-pagadoras.service';
import { CreateEmpresaPagadoraDto } from './dto/create-empresa-pagadora.dto';
import { UpdateEmpresaPagadoraDto } from './dto/update-empresa-pagadora.dto';

@ApiTags('empresas-pagadoras')
@Controller('empresas-pagadoras')
export class EmpresasPagadorasController {
  constructor(private readonly service: EmpresasPagadorasService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: CreateEmpresaPagadoraDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmpresaPagadoraDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
