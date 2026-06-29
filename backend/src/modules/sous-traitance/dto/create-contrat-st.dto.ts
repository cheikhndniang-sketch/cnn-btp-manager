import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export enum ContratSTStatusDto {
  ACTIF = 'ACTIF',
  TERMINE = 'TERMINE',
  RESILIE = 'RESILIE',
}

export class CreateContratSTDto {
  @IsString()
  @MinLength(1)
  sousTraitantId!: string;

  @IsString()
  @IsOptional()
  lotId?: string;

  @IsString()
  @MinLength(1)
  reference!: string;

  @IsString()
  @MinLength(2)
  intitule!: string;

  @IsNumber()
  @Min(0)
  montantHt!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  tvaRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  tauxRg?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  avanceForfaitaire?: number;

  @IsEnum(ContratSTStatusDto)
  @IsOptional()
  status?: ContratSTStatusDto;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
