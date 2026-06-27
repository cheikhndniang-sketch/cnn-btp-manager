import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restreint un endpoint à une liste de rôles.
 * Usage : @Roles('ADMIN', 'DIRECTEUR_PROJET')
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
