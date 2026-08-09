import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum QualificationOuvrier {
  MANOEUVRE = 'MANOEUVRE',
  OUVRIER_SPECIALISE = 'OUVRIER_SPECIALISE',
  CHEF_EQUIPE = 'CHEF_EQUIPE',
  TECHNICIEN = 'TECHNICIEN',
  AGENT_MAITRISE = 'AGENT_MAITRISE',
  INGENIEUR = 'INGENIEUR',
  AUTRE = 'AUTRE',
}

/**
 * Un champ de formulaire laissé vide arrive en chaîne vide, que `@IsOptional()`
 * ne neutralise pas (il n'ignore que null/undefined). Sans cette conversion,
 * enregistrer un salarié sans date de sortie échoue en 400.
 *
 * La valeur devient `null` et non `undefined` : le service distingue les deux,
 * `null` effaçant la date alors que `undefined` la laisserait inchangée.
 */
const VideEnNull = () =>
  Transform(({ value }) => (value === '' ? null : value));

export class CreateOuvrierDto {
  @IsString()
  nom!: string;

  @IsOptional()
  @IsString()
  matricule?: string;

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
  salaireBase!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tauxPanier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tauxTransport?: number;

  @IsOptional()
  @IsBoolean()
  forfaitMensuel?: boolean;

  @IsOptional()
  @IsBoolean()
  exonereCotisations?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hsForfaitaire?: number;

  @IsDateString()
  dateEntree!: string;

  @IsOptional()
  @VideEnNull()
  @IsDateString()
  dateSortie?: string | null;

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
  matricule?: string;

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
  salaireBase?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tauxPanier?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tauxTransport?: number;

  @IsOptional()
  @IsBoolean()
  forfaitMensuel?: boolean;

  @IsOptional()
  @IsBoolean()
  exonereCotisations?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hsForfaitaire?: number;

  @IsOptional()
  @VideEnNull()
  @IsDateString()
  dateEntree?: string | null;

  @IsOptional()
  @VideEnNull()
  @IsDateString()
  dateSortie?: string | null;

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
