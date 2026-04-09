import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as XLSX from 'xlsx';
import { CredoresService } from './application/credores.service';
import { BatchActionDto } from './dto/batch-action.dto';
import { CreateCredorDto } from './dto/create-credor.dto';
import { ListCredoresQueryDto } from './dto/list-credores-query.dto';
import { UpdateCredorDto } from './dto/update-credor.dto';

@ApiTags('credores')
@Controller('credores')
export class CredoresController {
  constructor(private readonly service: CredoresService) {}

  @Get()
  list(@Query() query: ListCredoresQueryDto) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: CreateCredorDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCredorDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('batch/marcar-enviado')
  batchMarkEnviado(@Body() dto: BatchActionDto) {
    return this.service.batchMarkEnviado(dto);
  }

  @Post('batch/marcar-nao-enviado')
  batchMarkNaoEnviado(@Body() dto: BatchActionDto) {
    return this.service.batchMarkNaoEnviado(dto);
  }

  @Post('batch/excluir')
  batchDelete(@Body() dto: BatchActionDto) {
    return this.service.batchDelete(dto);
  }

  @Post('batch/exportar-pdfs-zip')
  @Header('Content-Type', 'application/zip')
  async batchExportPdfsZip(@Body() dto: BatchActionDto, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.service.generateBatchPdfZip(dto.ids);
    res.setHeader('Content-Disposition', 'attachment; filename="credores-pdfs.zip"');
    return new StreamableFile(buffer);
  }

  @Post(':id/open-folder')
  openFolder(@Param('id') id: string, @Body() body: { numero_pgc?: string }) {
    return this.service.openFolder(id, body?.numero_pgc);
  }

  @Get('export/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@Query() query: ListCredoresQueryDto, @Res({ passthrough: true }) res: Response) {
    const rows = await this.service.exportRows(query);
    const headers = ['nome', 'nome_normalizado', 'email', 'periodo', 'enviado', 'data_envio', 'grupo', 'valor_total'];
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((key) => `"${String((row as Record<string, unknown>)[key] ?? '').replace(/"/g, '""')}"`)
          .join(','),
      ),
    ].join('\n');

    res.setHeader('Content-Disposition', 'attachment; filename="credores.csv"');
    return new StreamableFile(Buffer.from(csv, 'utf8'));
  }

  @Get('export/xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportXlsx(@Query() query: ListCredoresQueryDto, @Res({ passthrough: true }) res: Response) {
    const rows = await this.service.exportRows(query);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Credores');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="credores.xlsx"');
    return new StreamableFile(buffer);
  }

  @Get(':id/export/pdf')
  @Header('Content-Type', 'application/pdf')
  async exportCredorPdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.service.generateCredorPdf(id);
    res.setHeader('Content-Disposition', 'attachment; filename="credor-relatorio.pdf"');
    return new StreamableFile(buffer);
  }

  @Get('rendimentos/:id/export/pdf')
  @Header('Content-Type', 'application/pdf')
  async exportRendimentoPdf(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const buffer = await this.service.generateRendimentoPdf(id);
    res.setHeader('Content-Disposition', 'attachment; filename="rendimento.pdf"');
    return new StreamableFile(buffer);
  }
}
