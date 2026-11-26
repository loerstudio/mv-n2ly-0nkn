import { useEffect, useMemo, useRef, useState } from 'react';
import { search, type Hit } from '../lib/engine';
import type { State } from '../lib/types';
import { setActiveDest } from '../store/store';
import { useUI } from './ctx';
import { IconChevron, IconSearch } from './icons';

const ORDER: Hit['kind'][] = ['destinazione', 'checkpoint', 'azione', 'ostacolo', 'strategia', 'metrica', 'zona', 'decisione'];
const LABEL: Record<Hit['kind'], string> = {
  destinazione: 'Destinazioni',
  checkpoint: 'Checkpoint',
  azione: 'Azioni',
  ostacolo: 'Ostacoli',
  strategia: 'Correzioni in uso',
  metrica: 'Metriche',
  zona: 'Zone di rischio',
  decisione: 'Storico',
};

export function Search({ s, onClose }: { s: State; onClose: () => void }) {
  const ui = useUI();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inp = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => {
    const h = search(s, q);
    return [...h].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  }, [s, q]);

  useEffect(() => inp.current?.focus(), []);
  useEffect(() => setSel(0), [q]);

  const pick = (h: Hit) => {
    onClose();
    if (h.kind === 'destinazione') {
      setActiveDest(h.id);
      ui.go({ k: 'dest' });
      ui.detent('full');
    } else if (h.kind === 'metrica') ui.modal({ k: 'reading', metricId: h.id });
    else if (h.kind === 'zona') ui.modal({ k: 'zone', id: h.id });
    else if (h.kind === 'decisione') {
      if (h.cpId && s.checkpoints.some((c) => c.id === h.cpId)) ui.openCp(h.cpId);
      else {
        ui.go({ k: 'history' });
        ui.detent('full');
      }
    } else if (h.cpId) ui.openCp(h.cpId);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((v) => Math.min(hits.length - 1, v + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((v) => Math.max(0, v - 1));
    } else if (e.key === 'Enter' && hits[sel]) pick(hits[sel]);
  };

  let lastKind = '';
  return (
    <div className="modal-back top" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search glass" role="dialog" aria-label="Cerca" onKeyDown={onKey}>
        <div className="search-in">
          <IconSearch size={18} />
          <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca checkpoint, azioni, numeri, decisioni" aria-label="Cerca" />
          <button className="link" onClick={onClose}>
            Chiudi
          </button>
        </div>
        <div className="search-res">
          {q.trim() && hits.length === 0 && <p className="muted pad">Nessun risultato per «{q}».</p>}
          {!q.trim() && <p className="muted pad">Cerca in tutta la rotta. Le correzioni non ancora usate restano nascoste.</p>}
          {hits.map((h, i) => {
            const head = h.kind !== lastKind ? LABEL[h.kind] : null;
            lastKind = h.kind;
            return (
              <div key={`${h.kind}${h.id}${i}`}>
                {head && <div className="lab pad-l">{head}</div>}
                <button className={`hit${i === sel ? ' on' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pick(h)}>
                  <div>
                    <div className="hit-t">{h.title}</div>
                    <div className="hit-s">{h.sub}</div>
                  </div>
                  <IconChevron size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
