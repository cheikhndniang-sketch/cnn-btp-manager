import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DocCategorie } from '@prisma/client';

export class UploadDocumentDto {
  @IsEnum(DocCategorie)
  @IsOptional()
  categorie?: DocCategorie;

  @IsString()
  @IsOptional()
  description?: string;
}
