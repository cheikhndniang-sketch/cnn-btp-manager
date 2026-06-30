import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Meteo } from '@prisma/client';

export class CreateRapportDto {
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsEnum(Meteo)
  meteo?: Meteo;

  @IsOptional()
  @IsInt()
  @Min(0)
  effectif?: number;

  @IsOptional()
  @IsString()
  travauxRealises?: string;

  @IsOptional()
  @IsString()
  materiaux?: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsOptional()
  @IsString()
  incidents?: string;
}
