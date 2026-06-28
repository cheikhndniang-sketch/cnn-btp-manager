import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DependencyType, TaskStatus } from '@prisma/client';

export class ImportDependencyDto {
  /** UID MS Project de la tâche prédécesseur (résolu via mppUid à l'import). */
  @Type(() => Number)
  @IsInt()
  fromUid!: number;

  @IsEnum(DependencyType)
  type!: DependencyType;

  @Type(() => Number)
  @IsInt()
  lagDays!: number;
}

export class ImportTaskDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPct?: number;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weight?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  /** UID MS Project d'origine (clé pour relier les dépendances). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  mppUid?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportDependencyDto)
  predecessors?: ImportDependencyDto[];
}

export class ImportLotDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weight?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportTaskDto)
  tasks!: ImportTaskDto[];
}

export class ImportPlanningDto {
  /** Si true, remplace tout le planning existant du chantier. */
  @IsOptional()
  @IsBoolean()
  replace?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportLotDto)
  lots!: ImportLotDto[];
}
