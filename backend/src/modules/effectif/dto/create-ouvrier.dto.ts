import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum QualificationOuvrier {
  MANOEUVRE = 'MANOEUVRE',
  OUVRIER_SPECIALISE = 'OUVRIER_SPECIALISE',
  CHEF_EQUIPE = 'CHEF_EQUIPE',
  TECHNICIEN = 'TECHNICIEN',
  AGENT_MAITRISE = 'AGENT_MAITRISE',
  INGENIEUR = 'INGENIEUR',
  AUTRE = 'AUTRE',
}

export class CreateOuvrierDto {
  @IsString()
  nom!: string;

  @IsOptional()
  @IsString()
  prenom?: string;

  @IsOptional()
  @IsString()
  fonction?: string;

  @IsOptional()
  @IsEnum(QualificationOuvrier)
  qualification?: QualificationOuvrier;

  @IsNumber()
  @Min(0)
  tauxJournalier!: number;

  @IsDateString()
  dateEntree!: string;

  @IsOptional()
  @IsDateString()
  dateSortie?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOuvrierDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsString()
  prenom?: string;

  @IsOptional()
  @IsString()
  fonction?: string;

  @IsOptional()
  @IsEnum(QualificationOuvrier)
  qualification?: QualificationOuvrier;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tauxJournalier?: number;

  @IsOptional()
  @IsDateString()
  dateEntree?: string;

  @IsOptional()
  @IsDateString()
  dateSortie?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
