import { clone, kvGet, kvSet } from '../lib/kv';
import { useSyncExternalStore } from 'react';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config';
import { KINDS, applyRecord, finishApply, hashOf, toRecords, unionReadings, withOrd, type Kind } from '../lib/records';
import type { Metric, State } from '../lib/types';
import { getState, replaceFromSync, setLocalHook } from './store';

// ── status ───────────────────────────────────────────────────────────────
export type SyncStatus = { type: 'off' | 'syncing' | 'upToDate' | 'offline' } | { type: 'failed'; message: string };
let status: SyncStatus = { type: 'off' };
const listeners = new Set<() => void>();

function setStatus(next: SyncStatus) {
  const same = next.type === status.type && (next.type !== 'failed' || (status.type === 'failed' && status.message === next.message));
  if (same) return;
  status = next;
  emitInfo();
}

export interface SyncInfo {
  status: SyncStatus;
  connected: boolean;
  lastSyncedAt: number | null;
}
let info: SyncInfo = { status, connected: false, lastSyncedAt: null };
function emitInfo() {
  info = { status, connected: !!S.key, lastSyncedAt: S.lastSyncedAt };
  listeners.forEach((l) => l());
}
export function useSyncInfo(): SyncInfo {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => info,
  );
}

// ── network ──────────────────────────────────────────────────────────────
class RpcError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function rpc<T>(fn: string, body: unknown, keepalive = false): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive,
  });
  const text = await response.text();
  if (!response.ok) {
    let message = response.statusText || `Errore ${response.status}`;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch {
      /* keep the status text */
    }
    throw new RpcError(response.status, message);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

interface Row {
  id: string;
  kind: string;
  data: unknown;
  deleted: boolean;
  modified_ms: number;
  device_id: string;
  updated_us: number;
}

// ── device identity and bookkeeping (kept apart from the app data) ────────
interface Meta {
  mod: number;
  dev: string;
  hash: string;
  pending: boolean;
  deleted: boolean;
}
interface SyncState {
  key: string | null;
  deviceID: string;
  cursorUS: number;
  lastSyncedAt: number | null;
  meta: Record<string, Meta>;
}

const DB = 'mattana-vita-sync-v1';
let S: SyncState = { key: null, deviceID: '', cursorUS: 0, lastSyncedAt: null, meta: {} };
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void kvSet(DB, S), 300);
}
async function persistNow() {
  clearTimeout(saveTimer);
  await kvSet(DB, S);
}

function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function deviceName(): string {
  const ua = navigator.userAgent;
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iPad) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  return 'Web';
}

const newer = (a: { mod: number; dev: string }, b: { mod: number; dev: string }) => a.mod > b.mod || (a.mod === b.mod && a.dev > b.dev);

// ── local changes → pending records ───────────────────────────────────────
let lastMod = 0;
const stamp = () => (lastMod = Math.max(Date.now(), lastMod + 1));

function diff(next: State, asOld = false) {
  if (!S.key && !asOld) return;
  const recs = toRecords(next);
  let changed = false;
  for (const [id, r] of recs) {
    const h = hashOf(r.data);
    const m = S.meta[id];
    if (!m || m.hash !== h || m.deleted) {
      S.meta[id] = { mod: asOld ? 0 : stamp(), dev: asOld ? '' : S.deviceID, hash: h, pending: true, deleted: false };
      changed = true;
    }
  }
  for (const [id, m] of Object.entries(S.meta)) {
    if (!recs.has(id) && !m.deleted) {
      S.meta[id] = { mod: stamp(), dev: S.deviceID, hash: '', pending: true, deleted: true };
      changed = true;
    }
  }
  if (changed) persistSoon();
  return changed;
}

function onLocalChange(next: State) {
  if (!S.key) return;
  if (diff(next)) requestSync(800);
}

// ── pairing ──────────────────────────────────────────────────────────────
/** Trades a one-time pairing code for this device's own key. */
export async function redeemPairingCode(code: string): Promise<'ok' | 'invalid'> {
  const key = randomHex(32);
  const ok = await rpc<boolean>('mv_pair_redeem', { p_code: code, p_key: key, p_label: deviceName() });
  if (!ok) return 'invalid';
  S = { key, deviceID: S.deviceID || randomHex(8), cursorUS: 0, lastSyncedAt: null, meta: {} };
  // what is already on this device is older than the cloud: the cloud wins where both have it
  diff(getState(), true);
  S.key = key;
  await persistNow();
  startSync();
  return 'ok';
}

/** A one-time code (valid 15 minutes) for connecting another device. */
export async function createPairingCode(): Promise<string> {
  if (!S.key) throw new Error('Non connesso');
  return rpc<string>('mv_pair_create', { p_key: S.key });
}

/** Cuts off every other device. This one keeps working. */
export async function revokeOtherDevices(): Promise<number> {
  if (!S.key) throw new Error('Non connesso');
  return rpc<number>('mv_revoke_others', { p_key: S.key });
}

/** Forgets this device's key. The data stays here and in the cloud. */
export async function disconnect() {
  stopSync();
  S = { key: null, deviceID: S.deviceID, cursorUS: 0, lastSyncedAt: null, meta: {} };
  await persistNow();
  setStatus({ type: 'off' });
}

// ── engine ───────────────────────────────────────────────────────────────
const PAGE = 500;
const BATCH = 300;
const OVERLAP_US = 60_000_000;

let running = false;
let again = false;
let debounce: ReturnType<typeof setTimeout> | undefined;
let poller: ReturnType<typeof setInterval> | undefined;
let wired = false;

export function startSync() {
  if (!S.key) {
    setStatus({ type: 'off' });
    return;
  }
  setLocalHook(onLocalChange);
  if (!wired) {
    wired = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestSync(0);
      else void flushOnHide();
    });
    window.addEventListener('online', () => requestSync(0));
    window.addEventListener('pagehide', () => void flushOnHide());
    window.addEventListener('focus', () => requestSync(0));
  }
  clearInterval(poller);
  poller = setInterval(() => {
    if (document.visibilityState === 'visible') requestSync(0);
  }, 10_000);
  setStatus({ type: 'syncing' });
  requestSync(0);
}

function stopSync() {
  clearInterval(poller);
  clearTimeout(debounce);
  poller = undefined;
  setLocalHook(() => undefined);
}

export function requestSync(delay = 800) {
  if (!S.key) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), delay);
}

export async function syncNow(): Promise<void> {
  if (!S.key) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await pass();
    } while (again);
  } finally {
    running = false;
  }
}

async function pass() {
  if (status.type !== 'upToDate') setStatus({ type: 'syncing' });
  try {
    diff(getState());
    await pull();
    await push();
    S.lastSyncedAt = Date.now();
    persistSoon();
    setStatus({ type: 'upToDate' });
    emitInfo();
  } catch (error) {
    if (error instanceof RpcError && /invalid sync key/i.test(error.message)) {
      setStatus({ type: 'failed', message: 'Questo dispositivo è stato scollegato. Collegalo di nuovo con un nuovo codice.' });
    } else if (error instanceof RpcError) {
      setStatus({ type: 'failed', message: error.message });
    } else if (error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError')) {
      setStatus({ type: 'offline' });
    } else {
      setStatus({ type: 'failed', message: error instanceof Error ? error.message : 'Sincronizzazione non riuscita' });
    }
  }
}

async function pull() {
  let afterUS = Math.max(0, S.cursorUS - OVERLAP_US);
  let afterId = '';
  for (;;) {
    const rows = await rpc<Row[]>('mv_pull', { p_key: S.key, p_after_us: afterUS, p_after_id: afterId, p_limit: PAGE });
    applyRows(rows);
    if (rows.length > 0) {
      const last = rows[rows.length - 1];
      afterUS = last.updated_us;
      afterId = last.id;
      if (last.updated_us > S.cursorUS) S.cursorUS = last.updated_us;
    }
    if (rows.length < PAGE) break;
  }
  persistSoon();
}

/** Applies the rows that are newer than this device's copy. */
function applyRows(rows: Row[]) {
  if (!rows.length) return;
  const next = clone(getState());
  withOrd(next);
  let changed = false;
  for (const row of rows) {
    if (!(KINDS as string[]).includes(row.kind)) continue;
    const kind = row.kind as Kind;
    const raw = row.id.slice(kind.length + 1);
    const remote = { mod: Number(row.modified_ms), dev: row.device_id };
    const local = S.meta[row.id];
    if (!local || newer(remote, local)) {
      let data: unknown = row.deleted ? null : row.data;
      if (kind === 'metric' && local?.pending && data) {
        // two devices logged readings: keep both
        const mine = next.metrics.find((m) => m.id === raw);
        const theirs = data as Metric;
        if (mine) data = { ...theirs, log: unionReadings(theirs.log ?? [], mine.log) };
        applyRecord(next, kind, raw, data);
        S.meta[row.id] = { mod: stamp(), dev: S.deviceID, hash: hashOf(data), pending: true, deleted: false };
        changed = true;
        continue;
      }
      applyRecord(next, kind, raw, data);
      S.meta[row.id] = { mod: remote.mod, dev: remote.dev, hash: hashOf(data), pending: false, deleted: row.deleted };
      changed = true;
    } else if (newer(local, remote)) {
      if (!local.pending) local.pending = true; // the server is behind: send again
    } else if (local.pending) {
      local.pending = false;
    }
  }
  if (changed) {
    finishApply(next);
    replaceFromSync(next);
  }
}

async function push() {
  const recs = toRecords(getState());
  const pending = Object.entries(S.meta).filter(([, m]) => m.pending);
  for (let i = 0; i < pending.length; i += BATCH) {
    const slice = pending.slice(i, i + BATCH);
    const payload = slice.map(([id, m]) => {
      const r = recs.get(id);
      const kind = id.slice(0, id.indexOf(':')) as Kind;
      return { id, kind, deleted: m.deleted || !r, modified_ms: m.mod, device_id: m.dev, data: m.deleted || !r ? null : r.data };
    });
    await rpc<number>('mv_push', { p_key: S.key, p_records: payload });
    for (const [id, sent] of slice) {
      const cur = S.meta[id];
      if (cur && cur.mod === sent.mod && cur.dev === sent.dev) cur.pending = false;
    }
    persistSoon();
  }
}

/** Sends what is left before the page is suspended. */
async function flushOnHide() {
  if (!S.key) return;
  void persistNow();
  diff(getState());
  const recs = toRecords(getState());
  const pending = Object.entries(S.meta)
    .filter(([, m]) => m.pending)
    .slice(0, 80)
    .map(([id, m]) => {
      const r = recs.get(id);
      return { id, kind: id.slice(0, id.indexOf(':')), deleted: m.deleted || !r, modified_ms: m.mod, device_id: m.dev, data: m.deleted || !r ? null : r.data };
    });
  if (!pending.length) return;
  try {
    await rpc<number>('mv_push', { p_key: S.key, p_records: pending }, true);
  } catch {
    /* stays pending, goes out on the next pass */
  }
}

// ── start-up ─────────────────────────────────────────────────────────────
/** Loads this device's sync identity, resumes syncing, and honours a #c=CODE link. */
export async function initSync(): Promise<'linked' | 'invalid' | 'error' | null> {
  try {
    const saved = await kvGet<SyncState>(DB);
    if (saved) S = saved;
  } catch {
    /* no storage */
  }
  if (!S.deviceID) S.deviceID = randomHex(8);
  emitInfo();
  if (S.key) {
    startSync();
    return null;
  }
  const m = location.hash.match(/[#&]c=([A-Za-z0-9]{6,12})/);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    return (await redeemPairingCode(m[1])) === 'ok' ? 'linked' : 'invalid';
  } catch {
    return 'error';
  }
}

export function lastSync(): number | null {
  return S.lastSyncedAt;
}
