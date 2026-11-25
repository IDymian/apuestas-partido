import { Routes } from '@angular/router';
import { adminGuard } from './admin/admin.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./public/home.page').then((m) => m.HomePage), title: 'La Polla del Partido' },
  { path: 'p/:code', loadComponent: () => import('./public/public-match.page').then((m) => m.PublicMatchPage) },
  {
    path: 'admin/login',
    loadComponent: () => import('./admin/admin-login.page').then((m) => m.AdminLoginPage),
    title: 'Entrar · La Polla',
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/admin-matches.page').then((m) => m.AdminMatchesPage),
    title: 'Partidos · La Polla',
  },
  {
    path: 'admin/m/:id',
    canActivate: [adminGuard],
    loadComponent: () => import('./admin/admin-match.page').then((m) => m.AdminMatchPage),
    title: 'Partido · La Polla',
  },
  { path: '**', redirectTo: '' },
];
