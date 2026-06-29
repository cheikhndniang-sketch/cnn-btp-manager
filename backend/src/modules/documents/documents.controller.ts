import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocCategorie, Role } from '@prisma/client';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

@Controller('sites/:siteId/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  private actor(user: AuthenticatedUser) {
    return { userId: user.userId, role: user.role as Role };
  }

  @Get()
  list(
    @Param('siteId') siteId: string,
    @Query('categorie') categorie: DocCategorie | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.docs.list(siteId, categorie, this.actor(user));
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @Param('siteId') siteId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.docs.upload(siteId, file, dto, this.actor(user));
  }

  @Get(':id/download')
  async download(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const doc = await this.docs.download(siteId, id, this.actor(user));
    res.setHeader('Content-Type', doc.mimetype);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(doc.nom)}`,
    );
    res.send(doc.contenu);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.docs.remove(siteId, id, this.actor(user));
  }
}
