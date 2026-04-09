import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GruposService } from './application/grupos.service';
import { CreateGrupoDto } from './dto/create-grupo.dto';
import { UpdateGrupoDto } from './dto/update-grupo.dto';

@ApiTags('grupos')
@Controller('grupos')
export class GruposController {
  constructor(private readonly gruposService: GruposService) {}

  @Get()
  list() {
    return this.gruposService.list();
  }

  @Post()
  create(@Body() dto: CreateGrupoDto) {
    return this.gruposService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateGrupoDto) {
    return this.gruposService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.gruposService.remove(id);
  }
}
