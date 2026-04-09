import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EmailsService } from './application/emails.service';
import { SendEmailsDto } from './dto/send-emails.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@ApiTags('emails')
@Controller('emails')
export class EmailsController {
  constructor(private readonly service: EmailsService) {}

  @Get('template')
  getTemplate() {
    return this.service.getTemplate();
  }

  @Put('template')
  updateTemplate(@Body() dto: UpdateTemplateDto) {
    return this.service.updateTemplate(dto);
  }

  @Post('enviar')
  sendBatch(@Body() dto: SendEmailsDto) {
    return this.service.sendBatch(dto);
  }

  @Post('enviar/:credorId')
  sendIndividual(@Param('credorId') credorId: string, @Query('numero_pgc') numeroPgc: string) {
    return this.service.sendIndividual(credorId, numeroPgc);
  }

  @Get('relatorio')
  report(@Query('limit') limit?: string) {
    return this.service.report(limit ? Number(limit) : 200);
  }
}
