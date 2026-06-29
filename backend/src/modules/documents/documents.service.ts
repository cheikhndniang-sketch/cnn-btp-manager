import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { DocCategorie, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SitesService } from '../sites/sites.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

const WRITER_ROLES: Role[] = [Role.ADMIN, Role.DIRECTEUR_PROJET, Role.DIRECTEUR_TRAVAUX];
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB

type Actor = { userId: string; role: Role };

const META_SELECT = {
  id: true,
  siteId: true,
  uploadedBy: true,
  nom: true,
  categorie: true,
  mimetype: true,
  taille: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { name: true } },
} as const;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: SitesService,
  ) {}

  async list(siteId: string, categorie: DocCategorie | undefined, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    return this.prisma.document.findMany({
      where: { siteId, ...(categorie ? { categorie } : {}) },
      orderBy: { createdAt: 'desc' },
      select: META_SELECT,
    });
  }

  async upload(
    siteId: string,
    file: Express.Multer.File,
    dto: UploadDocumentDto,
    actor: Actor,
  ) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!WRITER_ROLES.includes(actor.role)) throw new ForbiddenException('Droits insuffisants');
    if (file.size > MAX_SIZE) throw new PayloadTooLargeException('Fichier trop volumineux (max 15 MB)');

    return this.prisma.document.create({
      data: {
        siteId,
        uploadedBy: actor.userId,
        nom: Buffer.from(file.originalname, 'latin1').toString('utf8'),
        categorie: dto.categorie ?? DocCategorie.AUTRE,
        mimetype: file.mimetype,
        taille: file.size,
        contenu: file.buffer,
        description: dto.description,
      },
      select: META_SELECT,
    });
  }

  async download(siteId: string, docId: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    const doc = await this.prisma.document.findFirst({
      where: { id: docId, siteId },
    });
    if (!doc) throw new NotFoundException('Document introuvable');
    return doc;
  }

  async remove(siteId: string, docId: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!WRITER_ROLES.includes(actor.role)) throw new ForbiddenException('Droits insuffisants');
    const doc = await this.prisma.document.findFirst({ where: { id: docId, siteId } });
    if (!doc) throw new NotFoundException('Document introuvable');
    await this.prisma.document.delete({ where: { id: docId } });
  }
}
