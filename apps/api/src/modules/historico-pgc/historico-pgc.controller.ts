import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HistoricoPgcService } from './application/historico-pgc.service';
import { UpdateHistoricoPgcDto } from './dto/update-historico-pgc.dto';

@ApiTags('historico-pgc')
@Controller('historico-pgc')
export class HistoricoPgcController {
  constructor(private readonly service: HistoricoPgcService) {}

  @Get()
  list(@Query('credorId') credorId: string) {
    return this.service.list(credorId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHistoricoPgcDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
