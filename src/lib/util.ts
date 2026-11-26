import type { Unit } from './types';

let counter = 0;
export function newId(prefix = ''): string {
  counter += 1;
  const r = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${r}${counter}`;
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const DAY = 86_400_000;

// Italian CLDR does not group 4-digit numbers; money reads better as €1.250 than €1250
function fmt(max: number): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat('it-IT', { maximumFractionDigits: max, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions);
  } catch {
    return new Intl.NumberFormat('it-IT', { maximumFractionDigits: max });
  }
}
const it = fmt(1);
const it0 = fmt(0);

export function fmtNum(v: number): string {
  return Math.abs(v) >= 1000 ? it0.format(v) : it.format(v);
}

export function fmtVal(v: number | null | undefined, unit: Unit): string {
  if (v == null) return '—';
  switch (unit) {
    case 'eur':
      return `€${it0.format(v)}`;
    case 'pct':
      return `${it.format(v)}%`;
    case 'kg':
      return `${it.format(v)} kg`;
    case 'cm':
      return `${it.format(v)} cm`;
    case 'h':
      return `${it.format(v)} h`;
    default:
      return fmtNum(v);
  }
}

export const UNIT_LABEL: Record<Unit, string> = { eur: '€', n: 'numero', pct: '%', kg: 'kg', cm: 'cm', h: 'ore' };

export function fmtDate(t: number): string {
  return new Date(t).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDay(t: number): string {
  return new Date(t).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}
export function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
export function fmtMonth(t: number): string {
  return new Date(t).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });
}

export function ago(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'adesso';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h fa`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ieri' : `${d} giorni fa`;
}

export function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h} h ${String(m % 60).padStart(2, '0')} min`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** deterministic PRNG so the map looks the same on every device */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
