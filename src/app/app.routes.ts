import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./public/home.page').then((m) => m.HomePage), title: 'La Polla del Partido' },
  { path: 'p/:code', loadComponent: () => import('./public/public-match.page').then((m) => m.PublicMatchPage) },
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin-placeholder.page').then((m) => m.AdminPlaceholderPage),
    title: 'Organizador · La Polla',
  },
  { path: '**', redirectTo: '' },
];
