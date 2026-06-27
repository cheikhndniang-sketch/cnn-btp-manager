import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Hiérarchie des rôles (du plus puissant au moins puissant) :
 * ADMIN > DIRECTEUR_PROJET > DIRECTEUR_TRAVAUX > CONDUCTEUR_TRAVAUX
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  ADMIN: 4,
  DIRECTEUR_PROJET: 3,
  DIRECTEUR_TRAVAUX: 2,
  CONDUCTEUR_TRAVAUX: 1,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!user) {
      throw new ForbiddenException('Utilisateur non authentifié');
    }

    const userLevel = ROLE_HIERARCHY[user.role];
    const allowed = requiredRoles.some(
      (role) => userLevel >= ROLE_HIERARCHY[role],
    );

    if (!allowed) {
      throw new ForbiddenException(
        "Vous n'avez pas les droits nécessaires pour cette action",
      );
    }

    return true;
  }
}
