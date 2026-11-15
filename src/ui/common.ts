import { icon } from './icons';
import type { Safety } from '../data/parts';
import { SAFETY_LABEL } from '../data/parts';

export const BASE = import.meta.env.BASE_URL || './';
export const img = (file: string, size = 40, alt = '') =>
  `<img src="${BASE}icons/${file}" width="${size}" height="${size}" alt="${esc(alt)}" draggable="false" style="width:${size}px;height:${size}px">`;

export function esc(s: string) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function el<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

export const SAFETY_ICON: Record<Safety, string> = { solo: 'ph:user-fill', adulto: 'ph:users-fill', soloAdulto: 'ph:warning-octagon-fill' };
export const safetyTag = (s: Safety) => `<span class="tag tag-${s}">${icon(SAFETY_ICON[s], 13)}${SAFETY_LABEL[s]}</span>`;

export function header(extra = '') {
  return `<header class="topbar">
  <a class="brand" href="#/" aria-label="Torna al percorso">
    ${img('robot.svg', 42)}
    <span><b>Make <i>&amp;</i> Code Lab</b><small>THE LONDON ACADEMY</small></span>
  </a>
  ${extra}
</header>`;
}

let toastTimer = 0;
export function toast(html: string, opts: { action?: string; onAction?: () => void; ms?: number; kind?: 'ok' | 'info' | 'warn' } = {}) {
  document.querySelector('.toast')?.remove();
  const t = el(`<div class="toast toast-${opts.kind || 'info'}" role="status">${html}${opts.action ? `<button class="btn btn-small">${esc(opts.action)}</button>` : ''}</div>`);
  if (opts.action) t.querySelector('button')!.addEventListener('click', () => { opts.onAction?.(); t.remove(); });
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), opts.ms ?? 3500);
}

export function modal(html: string, opts: { wide?: boolean; onClose?: () => void } = {}) {
  const back = el(`<div class="modal-back"><div class="modal ${opts.wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
    <button class="icon-btn modal-x" aria-label="Chiudi">${icon('ph:x-bold', 24)}</button>${html}</div></div>`);
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); opts.onClose?.(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', e => { if (e.target === back) close(); });
  back.querySelector('.modal-x')!.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  (back.querySelector('.modal button:not(.modal-x), .modal a') as HTMLElement | null)?.focus();
  return { root: back, close };
}
