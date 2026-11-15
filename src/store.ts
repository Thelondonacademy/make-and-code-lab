// Salvataggio nel browser: progressi e lavori (niente account, niente dati inviati altrove).
import type { PartInst, Wire } from './sim/circuit';

export interface SavedWork { parts: PartInst[]; wires: Wire[]; mk?: any; step?: number }
export interface Progress { stars: Record<string, number> }

const K = 'mcl-v1-';
function get<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(K + k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
}
function set(k: string, v: unknown) {
  try { localStorage.setItem(K + k, JSON.stringify(v)); } catch { /* memoria piena o bloccata */ }
}

export const loadWork = (level: string) => get<SavedWork | null>('work-' + level, null);
export const saveWork = (level: string, w: SavedWork) => set('work-' + level, w);
export const clearWork = (level: string) => { try { localStorage.removeItem(K + 'work-' + level); localStorage.removeItem('mcl-mkid-' + level); } catch { /* */ } };
export const loadProgress = () => get<Progress>('progress', { stars: {} });
export const saveStars = (level: string, n: number) => { const p = loadProgress(); p.stars[level] = Math.max(p.stars[level] || 0, n); set('progress', p); };
export const getName = () => get<string>('name', '');
export const setName = (n: string) => set('name', n);
