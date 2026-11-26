// State <-> sync records. Self-contained (type imports only) so a Node script can use it too.
import type { Checkpoint, Decision, Destination, FocusSession, Metric, Settings, State, Zone } from './types';

export type Kind = 'dest' | 'cp' | 'metric' | 'zone' | 'decision' | 'focus' | 'settings';
export const KINDS: Kind[] = ['dest', 'cp', 'metric', 'zone', 'decision', 'focus', 'settings'];

export interface Rec {
  kind: Kind;
  data: unknown;
}

/** deterministic JSON: same object, same string, whatever the key order */
export function canon(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
    .join(',')}}`;
}

export function hashOf(v: unknown): string {
  const s = canon(v);
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h >>> 0}`;
}

export const recId = (kind: Kind, id: string) => `${kind}:${id}`;

/** everything that is shared between devices, one record each */
export function toRecords(s: State): Map<string, Rec> {
  const out = new Map<string, Rec>();
  s.destinations.forEach((d, i) => out.set(recId('dest', d.id), { kind: 'dest', data: { ...d, ord: i } }));
  const perDest = new Map<string, number>();
  for (const c of s.checkpoints) {
    const i = perDest.get(c.destId) ?? 0;
    perDest.set(c.destId, i + 1);
    out.set(recId('cp', c.id), { kind: 'cp', data: { ...c, ord: i } });
  }
  s.metrics.forEach((m, i) => out.set(recId('metric', m.id), { kind: 'metric', data: { ...m, ord: i } }));
  s.zones.forEach((z, i) => out.set(recId('zone', z.id), { kind: 'zone', data: { ...z, ord: i } }));
  for (const d of s.decisions) out.set(recId('decision', d.id), { kind: 'decision', data: d });
  for (const f of s.focus) out.set(recId('focus', f.id), { kind: 'focus', data: f });
  const { lastExportAt: _omit, ...settings } = s.settings;
  void _omit;
  out.set(recId('settings', 'main'), { kind: 'settings', data: settings });
  return out;
}

type WithOrd<T> = T & { ord?: number };
const strip = <T extends object>(x: WithOrd<T>): T => {
  const { ord: _o, ...rest } = x;
  void _o;
  return rest as unknown as T;
};

/** put one record into a state (or remove it when `data` is null) */
export function applyRecord(s: State, kind: Kind, id: string, data: unknown): void {
  const up = <T extends { id: string }>(list: T[], item: T | null) => {
    const i = list.findIndex((x) => x.id === id);
    if (item == null) {
      if (i >= 0) list.splice(i, 1);
    } else if (i >= 0) list[i] = item;
    else list.push(item);
  };
  switch (kind) {
    case 'dest':
      up(s.destinations, data == null ? null : (data as Destination & { ord?: number }));
      break;
    case 'cp':
      up(s.checkpoints, data == null ? null : (data as Checkpoint & { ord?: number }));
      break;
    case 'metric':
      up(s.metrics, data == null ? null : (data as Metric & { ord?: number }));
      break;
    case 'zone':
      up(s.zones, data == null ? null : (data as Zone & { ord?: number }));
      break;
    case 'decision':
      up(s.decisions, data == null ? null : (data as Decision));
      break;
    case 'focus':
      up(s.focus, data == null ? null : (data as FocusSession));
      break;
    case 'settings':
      if (data) s.settings = { ...s.settings, ...(data as Settings) };
      break;
  }
}

/** after applying records: restore the order, drop the transport field, keep the newest decisions first */
export function finishApply(s: State): void {
  const ord = (x: unknown) => (x as { ord?: number }).ord ?? 1e9;
  const by = (a: unknown, b: unknown) => ord(a) - ord(b) || String((a as { id: string }).id).localeCompare(String((b as { id: string }).id));
  s.destinations.sort(by);
  const di = new Map(s.destinations.map((d, i) => [d.id, i]));
  s.checkpoints.sort((a, b) => (di.get(a.destId) ?? 99) - (di.get(b.destId) ?? 99) || by(a, b));
  s.metrics.sort(by);
  s.zones.sort(by);
  s.destinations = s.destinations.map((d) => strip(d));
  s.checkpoints = s.checkpoints.map((c) => strip(c));
  s.metrics = s.metrics.map((m) => strip(m));
  s.zones = s.zones.map((z) => strip(z));
  s.decisions.sort((a, b) => b.t - a.t);
  s.focus.sort((a, b) => b.t0 - a.t0);
  if (!s.destinations.some((d) => d.id === s.activeDestId)) s.activeDestId = s.destinations[0]?.id ?? '';
}

/** the same record as the app stores it (no transport field), for hashing */
export function cleanData(kind: Kind, data: unknown): unknown {
  if (data == null) return null;
  if (kind === 'dest' || kind === 'cp' || kind === 'metric' || kind === 'zone') return strip(data as WithOrd<object>);
  return data;
}

export function unionReadings(a: Metric['log'], b: Metric['log']): Metric['log'] {
  const seen = new Set<string>();
  const out: Metric['log'] = [];
  for (const r of [...a, ...b]) {
    const k = `${r.t}|${r.v}|${r.note ?? ''}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(r);
    }
  }
  return out.sort((x, y) => x.t - y.t);
}

/** give every ordered record its current position again, so a partial update cannot reshuffle the rest */
export function withOrd(s: State): void {
  s.destinations.forEach((d, i) => ((d as { ord?: number }).ord = i));
  const per = new Map<string, number>();
  for (const c of s.checkpoints) {
    const i = per.get(c.destId) ?? 0;
    per.set(c.destId, i + 1);
    (c as { ord?: number }).ord = i;
  }
  s.metrics.forEach((m, i) => ((m as { ord?: number }).ord = i));
  s.zones.forEach((z, i) => ((z as { ord?: number }).ord = i));
}
