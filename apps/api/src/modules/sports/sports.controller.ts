import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { SportsService } from './sports.service';

@ApiTags('laghetto-sports')
@Controller('laghetto-sports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OPERADOR)
export class SportsController {
  constructor(private readonly sportsService: SportsService) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: { originalname?: string; buffer?: Buffer } | undefined,
    @Query('credores') credoresRaw?: string,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo obrigatorio no campo file.');
    }

    const credores = (credoresRaw ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    return this.sportsService.startUpload(file.originalname ?? 'upload.xlsx', file.buffer, credores);
  }

  @Get(':requestId/status')
  status(@Param('requestId') requestId: string) {
    return this.sportsService.status(requestId);
  }

  @Get(':requestId/logs')
  logs(@Param('requestId') requestId: string) {
    return this.sportsService.logs(requestId);
  }

  @Get(':requestId/download')
  download(@Param('requestId') requestId: string) {
    return this.sportsService.download(requestId);
  }
}
