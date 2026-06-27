import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

function makeContext(user?: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('autorise quand aucun rôle requis', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('autorise un ADMIN sur un endpoint réservé DIRECTEUR_PROJET (hiérarchie)', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.DIRECTEUR_PROJET]);
    const ctx = makeContext({
      userId: 'a',
      username: 'admin',
      role: Role.ADMIN,
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('refuse un CONDUCTEUR_TRAVAUX sur un endpoint réservé ADMIN', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    const ctx = makeContext({
      userId: 'c',
      username: 'ct',
      role: Role.CONDUCTEUR_TRAVAUX,
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('refuse si aucun utilisateur authentifié', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);
    expect(() => guard.canActivate(makeContext())).toThrow(ForbiddenException);
  });
});
