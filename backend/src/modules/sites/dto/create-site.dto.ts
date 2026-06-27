import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { SiteStatus } from '@prisma/client';

export class CreateSiteDto {
  @IsString()
  @MinLength(3)
  reference!: string;

  @IsString()
  @MinLength(3)
  name!: string;

  @IsOptional()
  @IsString()
  location?: string;

  /** Montant du marché HT en FCFA (entier, peut être très grand → BigInt). */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  marcheHt!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  tvaRate?: number;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDatePlanned?: string;

  @IsOptional()
  @IsEnum(SiteStatus)
  status?: SiteStatus;

  @IsOptional()
  @IsString()
  description?: string;
}
