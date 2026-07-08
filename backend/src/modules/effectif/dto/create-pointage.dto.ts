import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertPointageDto {
  @IsString()
  ouvrierId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsBoolean()
  present?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  heures?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(12)
  heuresNuit?: number;

  @IsOptional()
  @IsBoolean()
  jourFerie?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class DeletePointageDto {
  @IsString()
  ouvrierId!: string;

  @IsDateString()
  date!: string;
}
