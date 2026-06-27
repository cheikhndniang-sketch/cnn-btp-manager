import { IsString, Matches, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, { message: 'Le mot de passe doit contenir une majuscule' })
  @Matches(/[a-z]/, { message: 'Le mot de passe doit contenir une minuscule' })
  @Matches(/[0-9]/, { message: 'Le mot de passe doit contenir un chiffre' })
  newPassword!: string;
}
