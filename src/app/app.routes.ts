import { Routes } from '@angular/router';
import { adminGuard } from './admin/admin.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./public/home.page').then((m) => m.HomePage), title: 'Apuestas del Partido' },
  { path: 'p/:code', loadComponent: () => import('./public/public-match.page').then((m) => m.PublicMatchPage) },
  {
    path: 'admin/login',
    loadComponent: () => import('./admin/admin-login.page').then((m) => m.AdminLoginPage),
    title: 'Entrar · Apuestas',
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/admin-matches.page').then((m) => m.AdminMatchesPage),
    title: 'Jornadas · Apuestas',
  },
  {
    path: 'admin/m/:id',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/admin-match.page').then((m) => m.AdminMatchPage),
    title: 'Jornada · Apuestas',
  },
  { path: '**', redirectTo: '' },
];
