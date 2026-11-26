export type ActionStatus = 'todo' | 'doing' | 'done' | 'blocked' | 'failed';

export interface Action {
  id: string;
  text: string;
  status: ActionStatus;
  createdAt: number;
  startedAt?: number;
  doneAt?: number;
  blockedReason?: string;
  failNote?: string;
  fromStrategy?: string;
}

/** A measurable condition on a metric. `any` = it is enough that a reading exists. */
export interface Target {
  metricId: string;
  value: number;
  dir: 'gte' | 'lte' | 'any';
  /** compare against the current value of another metric (× mult) instead of `value` */
  ref?: string;
  mult?: number;
  /** compare the metric's conversion rate over its parent (in %) instead of its value */
  rate?: boolean;
}

export interface Criterion {
  id: string;
  text: string;
  target?: Target;
  /** manual criteria only */
  done?: boolean;
  evidence?: string;
  doneAt?: number;
}

export interface Obstacle {
  id: string;
  text: string;
}

export type StrategyStatus = 'ready' | 'applied' | 'rejected' | 'ineffective' | 'worked';

export interface Strategy {
  id: string;
  obstacleId?: string;
  title: string;
  when: string;
  steps: string[];
  status: StrategyStatus;
  appliedAt?: number;
  manual?: boolean;
}

export interface Checkpoint {
  id: string;
  destId: string;
  title: string;
  result: string;
  why: string;
  prereqs: string[];
  deps: string[];
  actions: Action[];
  targets: Target[];
  resources: string[];
  obstacles: Obstacle[];
  criteria: Criterion[];
  strategies: Strategy[];
  activatedAt?: number;
  doneAt?: number;
  doneNote?: string;
}

export type Unit = 'eur' | 'n' | 'pct' | 'kg' | 'cm' | 'h';

export interface Reading {
  t: number;
  v: number;
  note?: string;
}

export interface Metric {
  id: string;
  destId?: string;
  label: string;
  unit: Unit;
  /** counter: you log how many new ones; gauge: you log the value as it is now */
  kind: 'gauge' | 'counter';
  desc: string;
  parentId?: string;
  group?: string;
  log: Reading[];
}

export interface Destination {
  id: string;
  tag: string;
  name: string;
  goal: string;
  start: string;
  createdAt: number;
}

export interface Zone {
  id: string;
  name: string;
  signal: string;
  counter: string;
}

export type DecisionType =
  | 'start'
  | 'done'
  | 'block'
  | 'unblock'
  | 'result'
  | 'verify'
  | 'checkpoint'
  | 'recalc'
  | 'approve'
  | 'reject'
  | 'edit'
  | 'focus'
  | 'data'
  | 'destination';

export interface Decision {
  id: string;
  t: number;
  type: DecisionType;
  destId?: string;
  cpId?: string;
  text: string;
  detail?: string;
}

export interface FocusSession {
  id: string;
  t0: number;
  t1?: number;
  plannedMin: number | null;
  cpId: string;
  actionId?: string;
  distractions: { t: number; zoneId?: string; note?: string }[];
  rests: { t0: number; t1?: number }[];
}

export interface Reminder {
  id: string;
  text: string;
  /** during Focus: every N minutes */
  everyMin?: number;
  /** daily at HH:MM (while the app is open) */
  at?: string;
  on: boolean;
}

export interface Settings {
  reminders: Reminder[];
  notify: boolean;
  focusMin: number;
  lastExportAt?: number;
}

export interface State {
  v: number;
  createdAt: number;
  activeDestId: string;
  destinations: Destination[];
  checkpoints: Checkpoint[];
  metrics: Metric[];
  zones: Zone[];
  decisions: Decision[];
  focus: FocusSession[];
  settings: Settings;
}

export const SCHEMA = 1;
