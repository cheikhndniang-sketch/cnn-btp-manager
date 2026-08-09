import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { DocCategorie } from '@prisma/client';

export class UploadDocumentDto {
  @IsEnum(DocCategorie)
  @IsOptional()
  categorie?: DocCategorie;

  @IsString()
  @IsOptional()
  description?: string;

  // Géolocalisation optionnelle (photos terrain)
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;
}
