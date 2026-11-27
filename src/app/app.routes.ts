import { Routes } from '@angular/router';
import { adminGuard } from './admin/admin.guard';

const auth = () => import('./auth/auth.page').then((m) => m.AuthPage);

export const routes: Routes = [
  { path: '', loadComponent: () => import('./public/home.page').then((m) => m.HomePage), title: 'Copa Álvaro · La esférica no se mancha' },
  { path: 'entrar', loadComponent: auth, data: { mode: 'login' }, title: 'Entrar · Copa Álvaro' },
  { path: 'registro', loadComponent: auth, data: { mode: 'signup' }, title: 'Crear cuenta · Copa Álvaro' },
  { path: 'recuperar', loadComponent: auth, data: { mode: 'forgot' }, title: 'Recuperar contraseña · Copa Álvaro' },
  { path: 'nueva-clave', loadComponent: auth, data: { mode: 'reset' }, title: 'Nueva contraseña · Copa Álvaro' },
  { path: 'cuenta-confirmada', loadComponent: auth, data: { mode: 'confirmed' }, title: 'Cuenta confirmada · Copa Álvaro' },
  { path: 'p/:code', loadComponent: () => import('./public/public-match.page').then((m) => m.PublicMatchPage) },
  {
    path: 'admin/login',
    loadComponent: () => import('./admin/admin-login.page').then((m) => m.AdminLoginPage),
    title: 'Organizador · Copa Álvaro',
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/admin-matches.page').then((m) => m.AdminMatchesPage),
    title: 'Jornadas · Copa Álvaro',
  },
  {
    path: 'admin/pagos',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/admin-payments.page').then((m) => m.AdminPaymentsPage),
    title: 'Pagos · Copa Álvaro',
  },
  {
    path: 'admin/m/:id',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/admin-match.page').then((m) => m.AdminMatchPage),
    title: 'Jornada · Copa Álvaro',
  },
  { path: '**', redirectTo: '' },
];
