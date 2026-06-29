import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSousTraitantDto {
  @IsString()
  @MinLength(2)
  nom!: string;

  @IsString()
  @IsOptional()
  contact?: string;
}
