import { clone, kvGet, kvSet } from '../lib/kv';
import { useSyncExternalStore } from 'react';
import { emptyState } from '../lib/seed';
import { cpById, cpsOf, critMet, destById, metricById, nextAction, progress } from '../lib/engine';
import { SCHEMA, type Action, type Checkpoint, type DecisionType, type Destination, type FocusSession, type Metric, type State, type Strategy, type Zone } from '../lib/types';
import { newId } from '../lib/util';

const DB_KEY = 'mattana-vita-state-v1';
const BACKUP_KEY = 'mattana-vita-backups-v1';

let state: State = emptyState();
let ready = false;
let persistOk = true;
let savedAt: number | null = null;
let version = 0;
const listeners = new Set<() => void>();
let timer: number | undefined;
let localHook: (next: State) => void = () => undefined;

/** the sync layer learns about every local change through this */
export function setLocalHook(fn: (next: State) => void) {
  localHook = fn;
}

/** state that arrived from the cloud: shown and saved, but not counted as a local edit */
export function replaceFromSync(next: State) {
  state = next;
  emit();
  schedule();
}

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

export function getState(): State {
  return state;
}
export function useStore(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export interface Meta {
  ready: boolean;
  persistOk: boolean;
  savedAt: number | null;
}
export function getMeta(): Meta {
  return { ready, persistOk, savedAt };
}
let metaSnap: Meta = getMeta();
export function useMeta() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      if (metaSnap.ready !== ready || metaSnap.persistOk !== persistOk || metaSnap.savedAt !== savedAt) metaSnap = { ready, persistOk, savedAt };
      return metaSnap;
    },
  );
}

// ── persistence ────────────────────────────────────────────────────────────
async function writeNow() {
  const ok = await kvSet(DB_KEY, state);
  if (ok) savedAt = Date.now();
  persistOk = ok;
  emit();
}

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(writeNow, 250);
}

export function flush() {
  window.clearTimeout(timer);
  void writeNow();
}

function sane(s: unknown): s is State {
  const x = s as State;
  return !!x && Array.isArray(x.destinations) && Array.isArray(x.checkpoints) && Array.isArray(x.metrics) && Array.isArray(x.zones) && Array.isArray(x.decisions) && x.settings != null && typeof x.activeDestId === 'string';
}

export async function hydrate() {
  let loaded: unknown = await kvGet(DB_KEY);
  if (!loaded) {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) loaded = JSON.parse(raw);
    } catch {
      loaded = undefined;
    }
  }
  if (sane(loaded)) {
    state = loaded;
    if (!state.focus) state.focus = [];
    if (!state.settings.reminders) state.settings.reminders = [];
  } else {
    state = emptyState();
    await writeNow();
  }
  ready = true;
  emit();
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* not supported */
  }
  void dailySnapshot();
}

// ── backups (kept on this device) ──────────────────────────────────────────
export interface Snapshot {
  t: number;
  label: string;
  json: string;
}

export async function listSnapshots(): Promise<Snapshot[]> {
  return (await kvGet<Snapshot[]>(BACKUP_KEY)) ?? [];
}

export async function takeSnapshot(label: string) {
  const list = await listSnapshots();
  list.unshift({ t: Date.now(), label, json: JSON.stringify(state) });
  await kvSet(BACKUP_KEY, list.slice(0, 8));
}

async function dailySnapshot() {
  const list = await listSnapshots();
  if (!list.length || Date.now() - list[0].t > 20 * 3_600_000) await takeSnapshot('Automatico');
}

export async function restoreSnapshot(t: number): Promise<boolean> {
  const snap = (await listSnapshots()).find((s) => s.t === t);
  if (!snap) return false;
  await takeSnapshot('Prima del ripristino');
  state = JSON.parse(snap.json) as State;
  log('data', 'Ripristinato un backup', new Date(t).toLocaleString('it-IT'));
  localHook(state);
  flush();
  return true;
}

// ── mutation core ──────────────────────────────────────────────────────────
export function mutate(fn: (d: State) => void) {
  const d = clone(state);
  fn(d);
  state = d;
  emit();
  schedule();
  localHook(d);
}

function logTo(d: State, type: DecisionType, text: string, detail?: string, ids: { destId?: string; cpId?: string } = {}) {
  d.decisions.unshift({ id: newId('d'), t: Date.now(), type, text, detail, ...ids });
  if (d.decisions.length > 1500) d.decisions.length = 1500;
}
function log(type: DecisionType, text: string, detail?: string, ids?: { destId?: string; cpId?: string }) {
  mutate((d) => logTo(d, type, text, detail, ids));
}

const findCp = (d: State, id: string) => d.checkpoints.find((c) => c.id === id)!;

// ── actions ────────────────────────────────────────────────────────────────
export function setActiveDest(id: string) {
  mutate((d) => {
    d.activeDestId = id;
  });
}

export function startAction(cpId: string, aid: string) {
  mutate((d) => {
    const cp = findCp(d, cpId);
    for (const a of cp.actions) if (a.status === 'doing' && a.id !== aid) a.status = 'todo';
    const a = cp.actions.find((x) => x.id === aid)!;
    a.status = 'doing';
    a.startedAt = Date.now();
    a.blockedReason = undefined;
    logTo(d, 'start', `Iniziata: ${a.text}`, undefined, { destId: cp.destId, cpId });
  });
}

export function completeAction(cpId: string, aid: string) {
  mutate((d) => {
    const cp = findCp(d, cpId);
    const a = cp.actions.find((x) => x.id === aid)!;
    a.status = 'done';
    a.doneAt = Date.now();
    a.blockedReason = undefined;
    logTo(d, 'done', `Completata: ${a.text}`, 'Azione completata. Il risultato va verificato con i criteri.', { destId: cp.destId, cpId });
  });
}

export function blockAction(cpId: string, aid: string, reason: string) {
  mutate((d) => {
    const cp = findCp(d, cpId);
    const a = cp.actions.find((x) => x.id === aid)!;
    a.status = 'blocked';
    a.blockedReason = reason;
    logTo(d, 'block', `Bloccata: ${a.text}`, reason, { destId: cp.destId, cpId });
  });
}

export function unblockAction(cpId: string, aid: string) {
  mutate((d) => {
    const cp = findCp(d, cpId);
    const a = cp.actions.find((x) => x.id === aid)!;
    a.status = 'todo';
    a.blockedReason = undefined;
    logTo(d, 'unblock', `Sbloccata: ${a.text}`, undefined, { destId: cp.destId, cpId });
  });
}

export function recordReading(metricId: string, value: number, note?: string, asDelta = false) {
  mutate((d) => {
    const m = d.metrics.find((x) => x.id === metricId)!;
    const last = m.log.length ? m.log[m.log.length - 1].v : 0;
    const v = asDelta ? last + value : value;
    m.log.push({ t: Date.now(), v, note: note?.trim() || undefined });
    logTo(d, 'result', `${m.label}: ${asDelta ? `+${value} → ` : ''}${v}`, note?.trim() || undefined, { destId: m.destId });
  });
}

export function undoLastReading(metricId: string) {
  mutate((d) => {
    const m = d.metrics.find((x) => x.id === metricId)!;
    if (m.log.length) {
      m.log.pop();
      logTo(d, 'edit', `Annullata l'ultima misura di ${m.label}`, undefined, { destId: m.destId });
    }
  });
}

export function verifyCriterion(cpId: string, critId: string, evidence: string) {
  mutate((d) => {
    const cp = findCp(d, cpId);
    const c = cp.criteria.find((x) => x.id === critId)!;
    c.done = true;
    c.evidence = evidence.trim();
    c.doneAt = Date.now();
    logTo(d, 'verify', `Criterio verificato: ${c.text}`, evidence.trim(), { destId: cp.destId, cpId });
  });
}

export function unverifyCriterion(cpId: string, critId: string) {
  mutate((d) => {
    const cp = findCp(d, cpId);
    const c = cp.criteria.find((x) => x.id === critId)!;
    c.done = false;
    c.evidence = undefined;
    c.doneAt = undefined;
    logTo(d, 'verify', `Verifica rimossa: ${c.text}`, undefined, { destId: cp.destId, cpId });
  });
}

export function completeCheckpoint(cpId: string, note: string) {
  mutate((d) => {
    const cp = findCp(d, cpId);
    const now = Date.now();
    cp.doneAt = now;
    cp.doneNote = note.trim() || undefined;
    for (const st of cp.strategies) if (st.status === 'applied') st.status = 'worked';
    const list = d.checkpoints.filter((c) => c.destId === cp.destId);
    const next = list.find((c) => !c.doneAt);
    if (next && !next.activatedAt) next.activatedAt = now;
    // checkpoints waiting on this one elsewhere start counting now
    for (const c of d.checkpoints) if (c.deps.includes(cpId) && !c.activatedAt && !c.doneAt) {
      const first = d.checkpoints.filter((x) => x.destId === c.destId).find((x) => !x.doneAt);
      if (first?.id === c.id) c.activatedAt = now;
    }
    logTo(d, 'checkpoint', `Checkpoint raggiunto: ${cp.title}`, note.trim() || undefined, { destId: cp.destId, cpId });
  });
}

export function reopenCheckpoint(cpId: string) {
  mutate((d) => {
    const cp = findCp(d, cpId);
    cp.doneAt = undefined;
    cp.doneNote = undefined;
    logTo(d, 'edit', `Checkpoint riaperto: ${cp.title}`, 'Riaperto per correggere una conferma.', { destId: cp.destId, cpId });
  });
}

export interface RecalcInput {
  cpId: string;
  actionId?: string;
  outcome: 'fallita' | 'nessun-risultato' | 'bloccata';
  what: string;
  obstacleId?: string;
  customObstacle?: string;
  /** an existing strategy to apply, possibly edited */
  strategyId?: string;
  /** or a brand-new one written by hand */
  manual?: { title: string; steps: string[] };
  steps?: string[];
}

/** records the failure, marks what did not work, and puts the correction at the top of the route. The destination is untouched. */
export function applyRecalc(input: RecalcInput) {
  mutate((d) => {
    const cp = findCp(d, input.cpId);
    const now = Date.now();
    const failed = input.actionId ? cp.actions.find((a) => a.id === input.actionId) : undefined;
    if (failed) {
      if (input.outcome === 'bloccata') {
        // still waiting on something outside my control: it stays in the queue, below the correction
        failed.status = 'blocked';
        failed.blockedReason = failed.blockedReason ?? input.what.trim();
      } else {
        failed.status = 'failed';
        failed.failNote = input.what.trim();
        failed.doneAt = now;
        // the correction that produced this action did not work
        if (failed.fromStrategy) {
          const bad = cp.strategies.find((s) => s.id === failed.fromStrategy);
          if (bad && bad.status === 'applied') bad.status = 'ineffective';
        }
      }
    }
    // a previous correction for the same obstacle, fully executed, did not solve it
    for (const st of cp.strategies) {
      if (st.status === 'applied' && input.obstacleId && st.obstacleId === input.obstacleId) {
        const acts = cp.actions.filter((a) => a.fromStrategy === st.id);
        if (acts.every((a) => a.status === 'done' || a.status === 'failed')) st.status = 'ineffective';
      }
    }
    // untried steps of a correction that proved ineffective leave the route: one road only
    const dead = new Set(cp.strategies.filter((x) => x.status === 'ineffective').map((x) => x.id));
    cp.actions = cp.actions.filter((a) => !(a.fromStrategy && dead.has(a.fromStrategy) && a.status === 'todo'));
    let st: Strategy | undefined;
    if (input.manual) {
      st = {
        id: newId('s'),
        obstacleId: input.obstacleId,
        title: input.manual.title.trim(),
        when: `Scritta a mano il ${new Date(now).toLocaleDateString('it-IT')}`,
        steps: input.manual.steps,
        status: 'applied',
        appliedAt: now,
        manual: true,
      };
      cp.strategies.push(st);
    } else if (input.strategyId) {
      st = cp.strategies.find((s) => s.id === input.strategyId);
      if (st) {
        st.status = 'applied';
        st.appliedAt = now;
        if (input.steps) st.steps = input.steps;
      }
    }
    if (st) {
      const fresh: Action[] = st.steps.map((text) => ({ id: newId('a'), text, status: 'todo', createdAt: now, fromStrategy: st!.id }));
      const firstOpen = cp.actions.findIndex((a) => a.status === 'todo' || a.status === 'doing' || a.status === 'blocked');
      cp.actions.splice(firstOpen < 0 ? cp.actions.length : firstOpen, 0, ...fresh);
    }
    const obsText = input.obstacleId ? cp.obstacles.find((o) => o.id === input.obstacleId)?.text : input.customObstacle?.trim();
    const letter = st ? String.fromCharCode(65 + Math.min(cp.strategies.findIndex((x) => x.id === st!.id), 25)) : '';
    logTo(
      d,
      'recalc',
      st ? `Percorso ricalcolato con la correzione ${letter} — ${st.title}` : 'Risultato registrato senza correzione',
      [`esito:${input.outcome}`, obsText ? `ostacolo:${obsText}` : '', input.obstacleId ? `obstacle:${input.obstacleId}` : '', failed ? `azione:${failed.text}` : '', input.what.trim(), 'Destinazione invariata.'].filter(Boolean).join(' · '),
      { destId: cp.destId, cpId: cp.id },
    );
  });
}

export function rejectStrategy(cpId: string, stId: string) {
  mutate((d) => {
    const cp = findCp(d, cpId);
    const st = cp.strategies.find((s) => s.id === stId)!;
    st.status = 'rejected';
    logTo(d, 'reject', `Correzione rifiutata: ${st.title}`, undefined, { destId: cp.destId, cpId });
  });
}

// ── editing ────────────────────────────────────────────────────────────────
export function saveCheckpoint(next: Checkpoint) {
  mutate((d) => {
    const i = d.checkpoints.findIndex((c) => c.id === next.id);
    if (i >= 0) d.checkpoints[i] = next;
    else d.checkpoints.push(next);
    logTo(d, 'edit', `Modificato il checkpoint: ${next.title}`, undefined, { destId: next.destId, cpId: next.id });
  });
}

export function moveCheckpoint(cpId: string, dir: -1 | 1) {
  mutate((d) => {
    const cp = findCp(d, cpId);
    const list = d.checkpoints.filter((c) => c.destId === cp.destId);
    const i = list.findIndex((c) => c.id === cpId);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const a = d.checkpoints.indexOf(list[i]);
    const b = d.checkpoints.indexOf(list[j]);
    [d.checkpoints[a], d.checkpoints[b]] = [d.checkpoints[b], d.checkpoints[a]];
    logTo(d, 'edit', `Spostato il checkpoint: ${cp.title}`, undefined, { destId: cp.destId, cpId });
  });
}

export function deleteCheckpoint(cpId: string) {
  mutate((d) => {
    const cp = findCp(d, cpId);
    d.checkpoints = d.checkpoints.filter((c) => c.id !== cpId);
    for (const c of d.checkpoints) c.deps = c.deps.filter((x) => x !== cpId);
    logTo(d, 'edit', `Eliminato il checkpoint: ${cp.title}`, undefined, { destId: cp.destId });
  });
}

export function saveDestination(dest: Destination, firstCp?: Checkpoint) {
  mutate((d) => {
    const i = d.destinations.findIndex((x) => x.id === dest.id);
    if (i >= 0) d.destinations[i] = dest;
    else {
      d.destinations.push(dest);
      if (firstCp) d.checkpoints.push(firstCp);
      d.activeDestId = dest.id;
    }
    logTo(d, 'destination', i >= 0 ? `Destinazione modificata: ${dest.name}` : `Nuova destinazione: ${dest.name}`, dest.goal, { destId: dest.id });
  });
}

export function deleteDestination(id: string) {
  mutate((d) => {
    if (d.destinations.length <= 1) return;
    const dest = d.destinations.find((x) => x.id === id);
    const gone = new Set(d.checkpoints.filter((c) => c.destId === id).map((c) => c.id));
    d.destinations = d.destinations.filter((x) => x.id !== id);
    d.checkpoints = d.checkpoints.filter((c) => c.destId !== id);
    for (const c of d.checkpoints) c.deps = c.deps.filter((x) => !gone.has(x));
    if (d.activeDestId === id) d.activeDestId = d.destinations[0].id;
    logTo(d, 'destination', `Destinazione eliminata: ${dest?.name ?? ''}`);
  });
}

export function saveMetric(m: Metric) {
  mutate((d) => {
    const i = d.metrics.findIndex((x) => x.id === m.id);
    if (i >= 0) d.metrics[i] = m;
    else d.metrics.push(m);
    logTo(d, 'edit', `${i >= 0 ? 'Modificata' : 'Nuova'} metrica: ${m.label}`, undefined, { destId: m.destId });
  });
}

export function deleteMetric(id: string) {
  mutate((d) => {
    const m = d.metrics.find((x) => x.id === id);
    d.metrics = d.metrics.filter((x) => x.id !== id);
    for (const c of d.checkpoints) {
      c.criteria = c.criteria.filter((k) => k.target?.metricId !== id && k.target?.ref !== id);
      c.targets = c.targets.filter((t) => t.metricId !== id);
    }
    for (const x of d.metrics) if (x.parentId === id) x.parentId = undefined;
    logTo(d, 'edit', `Eliminata la metrica: ${m?.label ?? ''}`);
  });
}

export function saveZone(z: Zone) {
  mutate((d) => {
    const i = d.zones.findIndex((x) => x.id === z.id);
    if (i >= 0) d.zones[i] = z;
    else d.zones.push(z);
    logTo(d, 'edit', `Zona di rischio ${i >= 0 ? 'modificata' : 'aggiunta'}: ${z.name}`);
  });
}

export function deleteZone(id: string) {
  mutate((d) => {
    d.zones = d.zones.filter((z) => z.id !== id);
  });
}

export function updateSettings(patch: Partial<State['settings']>) {
  mutate((d) => {
    d.settings = { ...d.settings, ...patch };
  });
}

// ── focus ──────────────────────────────────────────────────────────────────
export function saveFocus(f: FocusSession) {
  mutate((d) => {
    const i = d.focus.findIndex((x) => x.id === f.id);
    if (i >= 0) d.focus[i] = f;
    else d.focus.unshift(f);
    if (d.focus.length > 400) d.focus.length = 400;
    if (f.t1) {
      const mins = Math.round((f.t1 - f.t0) / 60000);
      logTo(d, 'focus', `Sessione Focus di ${mins} min`, `${f.distractions.length} distrazioni, ${f.rests.length} pause di riposo`, { cpId: f.cpId, destId: cpById(d, f.cpId)?.destId });
    }
  });
}

// ── data in / out ──────────────────────────────────────────────────────────
export interface ExportFile {
  app: 'mattana-vita';
  schema: number;
  exportedAt: string;
  state: State;
}

export function exportJson(): string {
  const f: ExportFile = { app: 'mattana-vita', schema: SCHEMA, exportedAt: new Date().toISOString(), state };
  return JSON.stringify(f, null, 2);
}

export function parseImport(text: string): { ok: true; state: State; summary: string } | { ok: false; error: string } {
  try {
    const f = JSON.parse(text) as ExportFile;
    if (f.app !== 'mattana-vita') return { ok: false, error: 'Questo file non è un backup di Mattana Vita.' };
    if (typeof f.schema !== 'number' || f.schema > SCHEMA) return { ok: false, error: 'Il file è stato creato da una versione più recente dell\'app.' };
    if (!sane(f.state)) return { ok: false, error: 'Il file è incompleto o danneggiato.' };
    const s = f.state;
    return { ok: true, state: s, summary: `${s.destinations.length} destinazioni, ${s.checkpoints.length} checkpoint, ${s.metrics.reduce((a, m) => a + m.log.length, 0)} misure, ${s.decisions.length} decisioni (${new Date(f.exportedAt).toLocaleDateString('it-IT')})` };
  } catch {
    return { ok: false, error: 'Il file non è un JSON valido.' };
  }
}

export async function importState(s: State) {
  await takeSnapshot('Prima dell\'importazione');
  state = s;
  if (!state.focus) state.focus = [];
  log('data', 'Dati importati da un file JSON');
  localHook(state);
  flush();
}

export async function resetAll() {
  await takeSnapshot('Prima del reset');
  state = emptyState();
  localHook(state);
  flush();
}

// ── convenience reads for UI ───────────────────────────────────────────────
export function activeDest(s: State) {
  return destById(s, s.activeDestId) ?? s.destinations[0];
}

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__mv = { getState, mutate, cpById, cpsOf, critMet, metricById, nextAction, progress };
}

window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});

export function addAction(cpId: string, text: string) {
  mutate((d) => {
    const cp = findCp(d, cpId);
    cp.actions.push({ id: newId('a'), text: text.trim(), status: 'todo', createdAt: Date.now() });
    logTo(d, 'edit', `Nuova azione: ${text.trim()}`, undefined, { destId: cp.destId, cpId });
  });
}

export function moveAction(cpId: string, aid: string, dir: -1 | 1) {
  mutate((d) => {
    const cp = findCp(d, cpId);
    const i = cp.actions.findIndex((a) => a.id === aid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cp.actions.length) return;
    [cp.actions[i], cp.actions[j]] = [cp.actions[j], cp.actions[i]];
  });
}

// load saved data as soon as the module is evaluated (also after a dev hot reload)
export const hydrated: Promise<void> = hydrate();
