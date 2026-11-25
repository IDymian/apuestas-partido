import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminApi } from '../core/admin-api';

/** Solo deja pasar a usuarios logueados que estén en la tabla `admins`. */
export const adminGuard: CanActivateFn = async () => {
  const api = inject(AdminApi);
  const router = inject(Router);
  try {
    if ((await api.currentEmail()) && (await api.isAdmin())) return true;
  } catch {
    /* sin conexión o sin sesión */
  }
  return router.parseUrl('/admin/login');
};
