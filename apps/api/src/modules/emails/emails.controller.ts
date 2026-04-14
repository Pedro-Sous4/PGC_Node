import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EmailsService } from './application/emails.service';
import { SendEmailsDto } from './dto/send-emails.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('emails')
@Controller('emails')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailsController {
  constructor(private readonly service: EmailsService) {}

  @Get('template')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.CONSULTA)
  getTemplate() {
    return this.service.getTemplate();
  }

  @Put('template')
  @Roles(Role.ADMIN)
  updateTemplate(@Body() dto: UpdateTemplateDto) {
    return this.service.updateTemplate(dto);
  }

  @Post('enviar')
  @Roles(Role.ADMIN, Role.OPERADOR)
  sendBatch(@Body() dto: SendEmailsDto) {
    return this.service.sendBatch(dto);
  }

  @Post('enviar/async')
  @Roles(Role.ADMIN, Role.OPERADOR)
  sendBatchAsync(@Body() dto: SendEmailsDto) {
    return this.service.sendBatchAsync(dto);
  }

  @Get('enviar/progresso/:dispatchId')
  @Roles(Role.ADMIN, Role.OPERADOR)
  getBatchProgress(@Param('dispatchId') dispatchId: string) {
    return this.service.getSendBatchProgress(dispatchId);
  }

  @Post('enviar/:credorId')
  @Roles(Role.ADMIN, Role.OPERADOR)
  sendIndividual(@Param('credorId') credorId: string, @Query('numero_pgc') numeroPgc: string) {
    return this.service.sendIndividual(credorId, numeroPgc);
  }

  @Get('relatorio')
  @Roles(Role.ADMIN, Role.OPERADOR, Role.CONSULTA)
  report(@Query('limit') limit?: string) {
    return this.service.report(limit ? Number(limit) : 200);
  }
}
