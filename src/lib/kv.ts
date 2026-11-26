import { get as idbGet, set as idbSet } from 'idb-keyval';

/**
 * Small key-value storage that never throws. IndexedDB first; if the browser does not expose it
 * (some in-app browsers, lockdown or private modes) or refuses a write, localStorage takes over.
 */
const hasIDB = () => {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB != null;
  } catch {
    return false;
  }
};

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (hasIDB()) {
    try {
      const v = await idbGet(key);
      if (v !== undefined) return v as T;
    } catch {
      /* fall through */
    }
  }
  try {
    const raw = localStorage.getItem(`kv:${key}`);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* nothing stored */
  }
  return undefined;
}

/** true when the value was stored somewhere */
export async function kvSet(key: string, value: unknown): Promise<boolean> {
  if (hasIDB()) {
    try {
      await idbSet(key, value);
      return true;
    } catch {
      /* fall through */
    }
  }
  try {
    localStorage.setItem(`kv:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** structuredClone with a fallback for older iOS */
export function clone<T>(v: T): T {
  return typeof structuredClone === 'function' ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T);
}
