import type { State } from './types';
import { SCHEMA } from './types';

/**
 * The app ships with no personal content: a new device starts empty and you either create your first destination
 * or import your own route file (Impostazioni → Importa da un file).
 */
export function emptyState(now: number = Date.now()): State {
  return {
    v: SCHEMA,
    createdAt: now,
    activeDestId: '',
    destinations: [],
    checkpoints: [],
    metrics: [],
    zones: [],
    decisions: [],
    focus: [],
    settings: { reminders: [], notify: false, focusMin: 25 },
  };
}
