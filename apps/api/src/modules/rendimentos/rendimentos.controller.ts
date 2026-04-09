import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RendimentosService } from './application/rendimentos.service';
import { CreateRendimentoDto } from './dto/create-rendimento.dto';
import { UpdateRendimentoDto } from './dto/update-rendimento.dto';

@ApiTags('rendimentos')
@Controller('rendimentos')
export class RendimentosController {
  constructor(private readonly service: RendimentosService) {}

  @Get()
  list(@Query('credorId') credorId: string) {
    return this.service.list(credorId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  create(@Body() dto: CreateRendimentoDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRendimentoDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
