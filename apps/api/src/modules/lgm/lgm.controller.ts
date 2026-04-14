import { BadRequestException, Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { LgmService } from './lgm.service';
import { ResolveErrorDto } from './dto/resolve-error.dto';

@ApiTags('lgm')
@Controller('lgm')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OPERADOR)
export class LgmController {
  constructor(private readonly lgmService: LgmService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: { originalname?: string; buffer?: Buffer } | undefined,
    @Query('credores') credoresCsv?: string,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo obrigatorio no campo file.');
    }

    const credores = (credoresCsv ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    return this.lgmService.startUpload(
      file.originalname ?? 'upload.xlsx',
      file.buffer,
      credores,
    );
  }

  @Get('arquivos')
  arquivos(
    @Query('numero_pgc') numeroPgc: string,
    @Query('empresa') empresa?: string,
  ) {
    return this.lgmService.listArquivos(numeroPgc, empresa);
  }

  @Get(':requestId/errors.json')
  errors(@Param('requestId') requestId: string) {
    return this.lgmService.errors(requestId);
  }

  @Get(':requestId/credores.json')
  credores(@Param('requestId') requestId: string) {
    return this.lgmService.credores(requestId);
  }

  @Get(':requestId/logs')
  logs(@Param('requestId') requestId: string) {
    return this.lgmService.logs(requestId);
  }

  @Get(':requestId/download')
  download(@Param('requestId') requestId: string) {
    return this.lgmService.download(requestId);
  }

  @Post(':requestId/errors/:errorId/resolve')
  resolveError(
    @Param('requestId') requestId: string,
    @Param('errorId') errorId: string,
    @Body() dto: ResolveErrorDto,
  ) {
    return this.lgmService.resolveError(requestId, errorId, dto);
  }
}
