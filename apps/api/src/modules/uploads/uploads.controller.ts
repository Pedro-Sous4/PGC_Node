import { BadRequestException, Controller, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './application/uploads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('uploads')
@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OPERADOR)
export class UploadsController {
  constructor(private readonly service: UploadsService) {}

  @Post('emails')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadEmails(
    @UploadedFile() file: { buffer?: Buffer } | undefined,
    @Query('allow_protected_update') allowProtectedUpdate?: string,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo obrigatorio no campo file.');
    }

    const allow = allowProtectedUpdate === 'true';
    return this.service.processCredoresEmailUpload(file.buffer, allow);
  }
}
