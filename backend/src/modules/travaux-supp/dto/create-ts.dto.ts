import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TSStatus } from '@prisma/client';

export class CreateTsDto {
  @IsString()
  reference!: string;

  @IsString()
  description!: string;

  @IsNumber()
  @Min(0)
  montantHt!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  tvaRate?: number;

  @IsString()
  @IsOptional()
  lotId?: string;

  @IsString()
  @IsOptional()
  dateNotif?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateTsDto {
  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  montantHt?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  tvaRate?: number;

  @IsString()
  @IsOptional()
  lotId?: string | null;

  @IsEnum(TSStatus)
  @IsOptional()
  status?: TSStatus;

  @IsString()
  @IsOptional()
  dateNotif?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
