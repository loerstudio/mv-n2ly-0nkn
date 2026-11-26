import { createContext, useContext } from 'react';

export type View =
  | { k: 'home' }
  | { k: 'cp'; id: string }
  | { k: 'dest' }
  | { k: 'numbers' }
  | { k: 'history' }
  | { k: 'zones' }
  | { k: 'settings' };

export type ModalSpec =
  | { k: 'result'; cpId: string; tab?: 'metrica' | 'criterio' | 'azione' }
  | { k: 'block'; cpId: string; actionId: string }
  | { k: 'recalc'; cpId: string; actionId?: string }
  | { k: 'verify'; cpId: string; critId: string }
  | { k: 'done'; cpId: string }
  | { k: 'edit-cp'; cpId: string | null; destId?: string }
  | { k: 'edit-dest'; destId: string | null }
  | { k: 'zone'; id: string | null }
  | { k: 'metric'; id: string | null }
  | { k: 'reading'; metricId: string }
  | { k: 'confirm'; title: string; body: string; ok: string; danger?: boolean; onOk: () => void };

export type Detent = 'peek' | 'half' | 'full';

export interface UI {
  go(v: View): void;
  back(): void;
  modal(m: ModalSpec | null): void;
  toast(msg: string): void;
  focus(): void;
  openCp(id: string): void;
  detent(d: Detent): void;
  wide: boolean;
  now: number;
}

export const UICtx = createContext<UI>(null as unknown as UI);
export const useUI = () => useContext(UICtx);
