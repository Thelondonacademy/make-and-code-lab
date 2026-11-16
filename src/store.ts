// Salvataggio nel browser: progressi e lavori (niente account, niente dati inviati altrove).
import type { PartInst, Wire } from './sim/circuit';
import { LEVELS } from './data/levels';

export interface SavedWork { parts: PartInst[]; wires: Wire[]; mk?: any; step?: number; rev?: number }
export interface Progress { stars: Record<string, number>; words?: Record<string, boolean> }

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
/** Le stelle contano solo per i livelli che esistono ancora (es. il vecchio "cagnolino" non c'è più). */
export const loadProgress = (): Progress => {
  const p = get<Progress>('progress', { stars: {} });
  const ids = new Set(LEVELS.map(l => l.id));
  return { ...p, stars: Object.fromEntries(Object.entries(p.stars).filter(([k]) => ids.has(k))) };
};
export const saveStars = (level: string, n: number) => { const p = get<Progress>('progress', { stars: {} }); p.stars[level] = Math.max(p.stars[level] || 0, n); set('progress', p); };
export const getName = () => get<string>('name', '');
export const setName = (n: string) => set('name', n);
export const getUnlockAll = () => get<boolean>('unlock-all', false);
export const setUnlockAll = (v: boolean) => set('unlock-all', v);

/** Le parole nuove imparate (una per progetto): si vincono rispondendo alla domanda finale. */
export const saveWord = (level: string) => { const p = get<Progress>('progress', { stars: {} }); p.words = { ...(p.words || {}), [level]: true }; set('progress', p); };
/** "Leggi da solo": ogni passo nuovo viene letto ad alta voce (si può spegnere, per esempio in classe). */
export const getAutoRead = () => get<boolean>('autoread', true);
export const setAutoRead = (v: boolean) => set('autoread', v);
