import type { Action, Checkpoint, Criterion, Destination, Metric, State, Strategy, Target } from './types';
import { DAY, fmtMonth, fmtVal, norm } from './util';

// ── lookups ────────────────────────────────────────────────────────────────
export const metricById = (s: State, id: string) => s.metrics.find((m) => m.id === id);
export const cpById = (s: State, id: string) => s.checkpoints.find((c) => c.id === id);
export const destById = (s: State, id: string) => s.destinations.find((d) => d.id === id);
export const cpsOf = (s: State, destId: string) => s.checkpoints.filter((c) => c.destId === destId);

export function cur(m?: Metric): number | null {
  return m && m.log.length ? m.log[m.log.length - 1].v : null;
}
export function lastReadingT(m?: Metric): number | null {
  return m && m.log.length ? m.log[m.log.length - 1].t : null;
}

/** share of this metric over its parent, 0..1 */
export function conv(s: State, m?: Metric): number | null {
  if (!m?.parentId) return null;
  const pc = cur(metricById(s, m.parentId));
  const mc = cur(m);
  if (pc == null || mc == null || pc <= 0) return null;
  return mc / pc;
}

// ── targets & criteria ─────────────────────────────────────────────────────
export function targetGoal(s: State, t: Target): number {
  if (t.ref) {
    const r = cur(metricById(s, t.ref));
    return r == null ? NaN : r * (t.mult ?? 1);
  }
  return t.value;
}
export function targetCurrent(s: State, t: Target): number | null {
  const m = metricById(s, t.metricId);
  if (!m) return null;
  if (t.rate) {
    const c = conv(s, m);
    return c == null ? null : c * 100;
  }
  return cur(m);
}
export function targetMet(s: State, t: Target): boolean {
  const m = metricById(s, t.metricId);
  if (!m) return false;
  if (t.dir === 'any') return m.log.length > 0;
  const c = targetCurrent(s, t);
  const g = targetGoal(s, t);
  if (c == null || Number.isNaN(g)) return false;
  return t.dir === 'gte' ? c >= g : c <= g;
}
export function critMet(s: State, c: Criterion): boolean {
  return c.target ? targetMet(s, c.target) : !!c.done;
}

export function progress(s: State, cp: Checkpoint) {
  const total = cp.criteria.length;
  const met = cp.criteria.filter((c) => critMet(s, c)).length;
  return { met, total, f: total ? met / total : 0, complete: total === 0 || met === total };
}

// ── status ─────────────────────────────────────────────────────────────────
export type CpStatus = 'done' | 'active' | 'locked';

export function lockReasons(s: State, cp: Checkpoint): string[] {
  const list = cpsOf(s, cp.destId);
  const idx = list.findIndex((c) => c.id === cp.id);
  const out: string[] = [];
  const prev = list.slice(0, idx).find((c) => !c.doneAt);
  if (prev) out.push(`Prima: ${prev.title}`);
  for (const id of cp.deps) {
    const d = cpById(s, id);
    if (d && !d.doneAt) out.push(`In attesa di: ${d.title} (${destById(s, d.destId)?.name ?? ''})`);
  }
  return out;
}
export function cpStatus(s: State, cp: Checkpoint): CpStatus {
  if (cp.doneAt) return 'done';
  return lockReasons(s, cp).length ? 'locked' : 'active';
}

/** first checkpoint of the destination not yet reached */
export function currentCp(s: State, destId: string): Checkpoint | null {
  return cpsOf(s, destId).find((c) => !c.doneAt) ?? null;
}

export function openActions(cp: Checkpoint): Action[] {
  return cp.actions.filter((a) => a.status === 'todo' || a.status === 'doing' || a.status === 'blocked');
}
export function nextAction(cp: Checkpoint): Action | null {
  const open = openActions(cp);
  return open.find((a) => a.status === 'doing') ?? open[0] ?? null;
}

/** position along the route in stop space: 0 = start, n = destination */
export function routePos(s: State, destId: string) {
  const list = cpsOf(s, destId);
  let d = 0;
  while (d < list.length && list[d].doneAt) d += 1;
  if (d >= list.length) return { pos: list.length, done: d, n: list.length, f: 0 };
  const f = progress(s, list[d]).f;
  return { pos: d + f, done: d, n: list.length, f };
}

export function whereText(s: State, dest: Destination): string {
  const list = cpsOf(s, dest.id);
  const r = routePos(s, dest.id);
  if (r.done >= list.length) return 'Destinazione raggiunta';
  const cp = list[r.done];
  const p = progress(s, cp);
  if (r.done === 0 && p.met === 0) return `Alla partenza · checkpoint 1 di ${list.length}`;
  return `Checkpoint ${r.done + 1} di ${list.length} · ${p.met} di ${p.total} criteri verificati`;
}

// ── metrics, trend & ETA ───────────────────────────────────────────────────
export interface Eta {
  kind: 'done' | 'eta' | 'unknown';
  at?: number;
  lo?: number;
  hi?: number;
  basis: string;
}

function slopePerDay(log: { t: number; v: number }[]): number | null {
  if (log.length < 3) return null;
  const t0 = log[0].t;
  const xs = log.map((r) => (r.t - t0) / DAY);
  const span = xs[xs.length - 1] - xs[0];
  if (span < 5) return null;
  const n = log.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = log.reduce((a, r) => a + r.v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (log[i].v - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

export function fmtEta(e: Eta): string {
  if (e.kind === 'done') return 'Raggiunto';
  if (e.kind === 'unknown') return 'ETA non ancora determinabile';
  if (e.lo != null && e.hi != null && fmtMonth(e.lo) !== fmtMonth(e.hi)) return `Tra ${fmtMonth(e.lo)} e ${fmtMonth(e.hi)}`;
  return `Verso ${fmtMonth(e.at!)}`;
}

export function cpEta(s: State, cp: Checkpoint, now = Date.now()): Eta {
  if (cp.doneAt) return { kind: 'done', basis: '' };
  const unmet = cp.criteria.filter((c) => !critMet(s, c));
  if (!unmet.length) return { kind: 'eta', at: now, basis: 'Tutti i criteri sono già soddisfatti: manca solo la conferma.' };
  const withMetric = unmet.filter((c) => c.target);
  const manual = unmet.length - withMetric.length;
  if (!withMetric.length) return { kind: 'unknown', basis: 'I criteri mancanti si verificano a mano: non c\'è una velocità misurabile.' };
  let lo = 0;
  let hi = 0;
  let nMeasures = 0;
  for (const c of withMetric) {
    const t = c.target!;
    const m = metricById(s, t.metricId);
    if (!m) return { kind: 'unknown', basis: 'Una metrica del checkpoint non esiste più.' };
    if (t.dir === 'any') return { kind: 'unknown', basis: `Manca la prima misura di «${m.label}».` };
    if (t.rate) return { kind: 'unknown', basis: `«${m.label}» è un tasso: servono più dati di base per stimare il tempo.` };
    const goal = targetGoal(s, t);
    const c0 = cur(m);
    if (c0 == null || Number.isNaN(goal)) return { kind: 'unknown', basis: `Manca la misura di «${m.label}».` };
    const all = slopePerDay(m.log);
    if (all == null) return { kind: 'unknown', basis: `«${m.label}»: servono almeno 3 misure distribuite su 5 giorni (ora ${m.log.length}).` };
    const recent = slopePerDay(m.log.slice(-3)) ?? all;
    const remaining = goal - c0;
    const dirOk = (v: number) => (t.dir === 'gte' ? v > 0 : v < 0);
    if (!dirOk(all) || !dirOk(recent)) return { kind: 'unknown', basis: `«${m.label}» non si sta muovendo verso l'obiettivo.` };
    const dA = remaining / all;
    const dR = remaining / recent;
    lo = Math.max(lo, Math.min(dA, dR));
    hi = Math.max(hi, Math.max(dA, dR));
    nMeasures += m.log.length;
  }
  const at = now + ((lo + hi) / 2) * DAY;
  return {
    kind: 'eta',
    at,
    lo: now + lo * DAY,
    hi: now + hi * DAY,
    basis: `Calcolata dalla velocità reale di ${withMetric.length} metrica/he (${nMeasures} misure).${manual ? ` Restano ${manual} criteri da verificare a mano, non inclusi.` : ''}`,
  };
}

export function destEta(s: State, destId: string, now = Date.now()): Eta {
  const list = cpsOf(s, destId);
  const remaining = list.filter((c) => !c.doneAt);
  if (!remaining.length) return { kind: 'done', basis: '' };
  const durs = list.filter((c) => c.doneAt && c.activatedAt).map((c) => c.doneAt! - c.activatedAt!).sort((a, b) => a - b);
  if (durs.length < 2) {
    return { kind: 'unknown', basis: `Servono almeno 2 checkpoint completati per stimare la velocità (ora ${durs.length}).` };
  }
  const med = durs[Math.floor(durs.length / 2)];
  const lo = durs[0];
  const hi = durs[durs.length - 1];
  const first = cpEta(s, remaining[0], now);
  const head = first.kind === 'eta' && first.at ? first.at - now : med;
  const rest = remaining.length - 1;
  return {
    kind: 'eta',
    at: now + head + rest * med,
    lo: now + Math.min(head, lo) + rest * lo,
    hi: now + Math.max(head, hi) + rest * hi,
    basis: `Basata su ${durs.length} checkpoint già completati (durata mediana ${Math.round(med / DAY)} giorni, da ${Math.round(lo / DAY)} a ${Math.round(hi / DAY)}). Include i ritardi e le correzioni documentate.`,
  };
}

/** how many contacts the funnel needs for one more paying client, from real conversion */
export function contactsForNext(s: State): number | null {
  const contatti = cur(metricById(s, 'm_contatti'));
  const clienti = cur(metricById(s, 'm_clienti'));
  if (contatti == null || clienti == null || contatti < 20 || clienti < 1) return null;
  return Math.ceil(contatti / clienti);
}

// ── corrections ────────────────────────────────────────────────────────────
export function pickStrategy(cp: Checkpoint, obstacleId?: string, skip: string[] = []): Strategy | null {
  const ready = cp.strategies.filter((x) => x.status === 'ready' && !skip.includes(x.id));
  return (obstacleId ? ready.find((x) => x.obstacleId === obstacleId) : undefined) ?? ready.find((x) => !x.obstacleId) ?? ready[0] ?? null;
}

export function strategyLetter(cp: Checkpoint, st: Strategy): string {
  const i = cp.strategies.findIndex((x) => x.id === st.id);
  return String.fromCharCode(65 + Math.min(i, 25));
}

export function recalcCount(s: State, cpId: string): number {
  return s.decisions.filter((d) => d.cpId === cpId && d.type === 'recalc').length;
}

export function evidence(s: State, cp: Checkpoint, obstacleId?: string, now = Date.now()): string[] {
  const out: string[] = [];
  const cnt = (st: string) => cp.actions.filter((a) => a.status === st).length;
  out.push(`${cnt('done')} azioni completate, ${cnt('failed')} fallite, ${cnt('blocked')} bloccate.`);
  if (cp.activatedAt) out.push(`Checkpoint attivo da ${Math.max(0, Math.round((now - cp.activatedAt) / DAY))} giorni.`);
  const seen = new Set<string>();
  const ids = [...cp.criteria.filter((c) => c.target).map((c) => c.target!.metricId), ...cp.targets.map((t) => t.metricId)];
  const missing: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const m = metricById(s, id);
    if (!m) continue;
    const c = cur(m);
    if (c == null) missing.push(m.label);
    else {
      const p = m.parentId ? metricById(s, m.parentId) : undefined;
      const cv = conv(s, m);
      out.push(`${m.label}: ${fmtVal(c, m.unit)}${p && cv != null ? ` su ${fmtVal(cur(p), p.unit)} ${p.label.toLowerCase()} (${Math.round(cv * 100)}%)` : ''}.`);
    }
  }
  if (missing.length) out.push(`Senza misure registrate: ${missing.join(', ')}. Senza numeri la correzione si basa solo su ciò che hai scritto.`);
  const n = s.decisions.filter((d) => d.cpId === cp.id && d.type === 'recalc').length;
  if (n) out.push(`Percorso già ricalcolato ${n} ${n === 1 ? 'volta' : 'volte'} in questo checkpoint.`);
  const sameObs = obstacleId ? s.decisions.filter((d) => d.cpId === cp.id && d.type === 'recalc' && d.detail?.includes(`obstacle:${obstacleId}`)).length : 0;
  if (sameObs) out.push(`Questo ostacolo è già comparso ${sameObs} ${sameObs === 1 ? 'volta' : 'volte'}.`);
  const bad = cp.strategies.filter((x) => x.status === 'ineffective');
  if (bad.length) out.push(`Correzioni già risultate inefficaci: ${bad.map((x) => `${strategyLetter(cp, x)} — ${x.title}`).join('; ')}.`);
  return out;
}

// ── search ─────────────────────────────────────────────────────────────────
export interface Hit {
  kind: 'destinazione' | 'checkpoint' | 'azione' | 'strategia' | 'ostacolo' | 'metrica' | 'decisione' | 'zona';
  id: string;
  title: string;
  sub: string;
  destId?: string;
  cpId?: string;
}

export function search(s: State, q: string): Hit[] {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  // every typed word must start a word in the text ("ban" finds "banca", not "urbano")
  const ok = (text: string) => {
    const n = ' ' + norm(text).replace(/[^a-z0-9]+/g, ' ');
    return terms.every((t) => n.includes(' ' + t.replace(/[^a-z0-9]+/g, '')));
  };
  const out: Hit[] = [];
  for (const d of s.destinations) {
    if (ok(`${d.name} ${d.goal} ${d.start} ${d.tag}`)) out.push({ kind: 'destinazione', id: d.id, title: d.name, sub: d.goal, destId: d.id });
  }
  for (const c of s.checkpoints) {
    const dn = destById(s, c.destId)?.name ?? '';
    if (ok(`${c.title} ${c.result} ${c.why} ${c.prereqs.join(' ')} ${c.resources.join(' ')}`)) out.push({ kind: 'checkpoint', id: c.id, title: c.title, sub: dn, destId: c.destId, cpId: c.id });
    for (const a of c.actions) if (ok(a.text)) out.push({ kind: 'azione', id: a.id, title: a.text, sub: `${c.title} · ${dn}`, destId: c.destId, cpId: c.id });
    for (const o of c.obstacles) if (ok(o.text)) out.push({ kind: 'ostacolo', id: o.id, title: o.text, sub: `${c.title} · ${dn}`, destId: c.destId, cpId: c.id });
    for (const st of c.strategies) if (st.status !== 'ready' && ok(`${st.title} ${st.when} ${st.steps.join(' ')}`)) out.push({ kind: 'strategia', id: st.id, title: `${strategyLetter(c, st)} — ${st.title}`, sub: `${c.title} · ${dn}`, destId: c.destId, cpId: c.id });
  }
  for (const m of s.metrics) if (ok(`${m.label} ${m.desc}`)) out.push({ kind: 'metrica', id: m.id, title: m.label, sub: m.group ?? '', destId: m.destId });
  for (const z of s.zones) if (ok(`${z.name} ${z.signal} ${z.counter}`)) out.push({ kind: 'zona', id: z.id, title: z.name, sub: 'Zona di rischio' });
  for (const d of s.decisions) if (ok(`${d.text} ${d.detail ?? ''}`)) out.push({ kind: 'decisione', id: d.id, title: d.text, sub: new Date(d.t).toLocaleDateString('it-IT'), destId: d.destId, cpId: d.cpId });
  return out.slice(0, 60);
}

// ── WEEK contract: ROAD decides priorities, WEEK organizes time ───────────
export function weekPriorities(s: State) {
  const dest = destById(s, s.activeDestId);
  const cp = dest ? currentCp(s, dest.id) : null;
  const status = cp ? cpStatus(s, cp) : null;
  const queue = cp && status === 'active' ? openActions(cp).slice(0, 5) : [];
  return {
    schema: 'road.priorities.v1',
    note: 'ROAD determina le priorità, WEEK organizza il tempo.',
    generatedAt: new Date().toISOString(),
    destination: dest ? { id: dest.id, name: dest.name, goal: dest.goal } : null,
    checkpoint: cp ? { id: cp.id, title: cp.title, result: cp.result, status } : null,
    next: queue[0] ? { id: queue[0].id, text: queue[0].text, status: queue[0].status } : null,
    queue: queue.map((a, i) => ({ id: a.id, priority: i + 1, text: a.text, status: a.status })),
  };
}

/** one-line headline of an action for the compact lane */
export function actionTitle(a: Action): string {
  if (a.short) return a.short;
  const t = a.text.trim();
  if (t.length <= 52) return t.replace(/[.:;]$/, '');
  const cut = t.search(/, |: | — | \(|\. /);
  if (cut >= 14 && cut <= 62) return t.slice(0, cut);
  const w = t.slice(0, 50).replace(/\s+\S*$/, '');
  return `${w}…`;
}
