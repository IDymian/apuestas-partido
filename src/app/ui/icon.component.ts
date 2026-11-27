import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * Íconos de trazo (24×24). Trazos basados en Lucide (licencia ISC).
 * Son constantes del código: es seguro marcarlos como HTML confiable.
 */
const p = (...d: string[]) => d.map((x) => `<path d="${x}"/>`).join('');
const ICONS = {
  ticket: p('M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z', 'M13 5v2', 'M13 17v2', 'M13 11v2'),
  live: p('M4.9 19.1C1 15.2 1 8.8 4.9 4.9', 'M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5', 'M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5', 'M19.1 4.9C23 8.8 23 15.1 19.1 19') + '<circle cx="12" cy="12" r="2"/>',
  chat: p('M7.9 20A9 9 0 1 0 4 16.1L2 22Z'),
  user: p('M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2') + '<circle cx="12" cy="7" r="4"/>',
  back: p('m12 19-7-7 7-7', 'M19 12H5'),
  next: p('M5 12h14', 'm12 5 7 7-7 7'),
  copy: '<rect x="8" y="8" width="14" height="14" rx="2"/>' + p('M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'),
  check: p('M20 6 9 17l-5-5'),
  x: p('M18 6 6 18', 'm6 6 12 12'),
  chevron: p('m6 9 6 6 6-6'),
  camera: p('M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z') + '<circle cx="12" cy="13" r="3"/>',
  send: p('m22 2-7 20-4-9-9-4Z', 'M22 2 11 13'),
  logout: p('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'),
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/>' + p('m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'),
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/>' + p('M7 11V7a5 5 0 0 1 10 0v4'),
  eye: p('M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z') + '<circle cx="12" cy="12" r="3"/>',
  eyeOff: p('M9.88 9.88a3 3 0 1 0 4.24 4.24', 'M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68', 'M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61', 'm2 2 20 20'),
  at: '<circle cx="12" cy="12" r="4"/>' + p('M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8'),
  sparkles: p('M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z'),
  trophy: p('M6 9H4.5a2.5 2.5 0 0 1 0-5H6', 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18', 'M4 22h16', 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22', 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22', 'M18 2H6v7a6 6 0 0 0 12 0V2Z'),
  wallet: p('M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'),
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/>' + p('M12 18h.01'),
  clock: '<circle cx="12" cy="12" r="10"/>' + p('M12 6v6l4 2'),
  alert: p('m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'),
  shield: p('M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'),
  refresh: p('M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'),
  home: p('M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'),
  external: p('M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'),
  qr: '<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/>' + p('M21 16h-3a2 2 0 0 0-2 2v3', 'M21 21v.01', 'M12 7v3a2 2 0 0 1-2 2H7', 'M3 12h.01', 'M12 3h.01', 'M12 16v.01', 'M16 12h1', 'M21 12v.01', 'M12 21v-1'),
  party: p('M5.8 11.3 2 22l10.7-3.79', 'M4 3h.01', 'M22 8h.01', 'M15 2h.01', 'M22 20h.01', 'm22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10', 'm22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17', 'm11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7', 'M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z'),
  edit: p('M12 20h9', 'M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z'),
  trash: p('M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2'),
  key: p('m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4', 'm21 2-9.6 9.6') + '<circle cx="7.5" cy="15.5" r="5.5"/>',
} as const;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0', 'aria-hidden': 'true' },
  template: `<svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    [attr.width]="size()"
    [attr.height]="size()"
    [attr.stroke-width]="stroke()"
    [innerHTML]="svg()"
  ></svg>`,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  readonly stroke = input(2);
  private sanitizer = inject(DomSanitizer);
  protected readonly svg = computed(() => this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()]));
}
