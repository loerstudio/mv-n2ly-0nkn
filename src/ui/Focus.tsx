import { useEffect, useMemo, useRef, useState } from 'react';
import { cpStatus, currentCp, nextAction } from '../lib/engine';
import { beep, keepAwake, notify } from '../lib/platform';
import type { FocusSession, State } from '../lib/types';
import { clock, fmtDur, newId } from '../lib/util';
import { activeDest, completeAction, saveFocus, startAction } from '../store/store';
import { useUI } from './ctx';
import { IconBlock, IconCheck, IconClose, IconCoffee, IconPause, IconPlay, IconResult, IconTurn } from './icons';
import { Btn } from './primitives';

const MSG = {
  idle: 'Una cosa alla volta.',
  start: 'Concentrati sulla prossima svolta.',
  off: 'Non cambiare destinazione. Correggi la direzione.',
  rest: 'Il riposo fa parte della rotta. Non è una distrazione.',
  end: 'Misura i risultati, non lo sforzo.',
  mid: ['Una cosa alla volta.', 'Non confondere movimento con progresso.', 'Concentrati sulla prossima svolta.'],
};

const PRESETS: (number | null)[] = [15, 25, 45, 60, null];

export function Focus({ s, onExit }: { s: State; onExit: () => void }) {
  const ui = useUI();
  const dest = activeDest(s);
  const cp = currentCp(s, dest.id);
  const act = cp ? nextAction(cp) : null;
  const usable = !!cp && cpStatus(s, cp) === 'active';

  const [minutes, setMinutes] = useState<number | null>(s.settings.focusMin);
  const [phase, setPhase] = useState<'idle' | 'run' | 'rest' | 'end'>('idle');
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [left0, setLeft0] = useState<number>(0); // ms remaining while resting
  const [t0, setT0] = useState<number | null>(null);
  const [off, setOff] = useState(false);
  const [pick, setPick] = useState(false);
  const [now, setNow] = useState(Date.now());
  const session = useRef<FocusSession | null>(null);
  const firedRem = useRef<Record<string, number>>({});
  const sRef = useRef(s);
  sRef.current = s;

  // keep the screen on during the session
  useEffect(() => {
    let release: () => void = () => undefined;
    void keepAwake().then((r) => (release = r));
    return () => release();
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const ensureSession = () => {
    if (!session.current && cp) {
      session.current = { id: newId('f'), t0: Date.now(), plannedMin: minutes, cpId: cp.id, actionId: act?.id, distractions: [], rests: [] };
    }
    return session.current;
  };

  const start = () => {
    const sn = ensureSession();
    if (!sn) return;
    if (act && act.status === 'todo') startAction(cp!.id, act.id);
    const t = Date.now();
    setT0(t);
    setPhase('run');
    setEndsAt(minutes ? t + minutes * 60000 : null);
    sn.plannedMin = minutes;
    setOff(false);
  };

  const toggleRest = () => {
    const sn = ensureSession();
    if (!sn) return;
    const t = Date.now();
    if (phase === 'run') {
      sn.rests.push({ t0: t });
      setLeft0(endsAt ? Math.max(0, endsAt - t) : 0);
      setPhase('rest');
    } else if (phase === 'rest') {
      const r = sn.rests[sn.rests.length - 1];
      if (r && !r.t1) r.t1 = t;
      setEndsAt(minutes ? t + left0 : null);
      setPhase('run');
    }
  };

  const logDistraction = (zoneId?: string) => {
    const sn = ensureSession();
    sn?.distractions.push({ t: Date.now(), zoneId });
    setOff(true);
    setPick(false);
  };

  const finish = (): number => {
    const sn = session.current;
    const t = Date.now();
    if (sn) {
      const r = sn.rests[sn.rests.length - 1];
      if (r && !r.t1) r.t1 = t;
      if (t - sn.t0 > 10_000 || sn.distractions.length) {
        sn.t1 = t;
        saveFocus({ ...sn });
      }
      session.current = null;
    }
    return t;
  };

  const exit = () => {
    finish();
    onExit();
  };

  // timer end + focus reminders
  useEffect(() => {
    if (phase !== 'run' || t0 == null) return;
    if (endsAt && now >= endsAt) {
      setPhase('end');
      beep();
      void notify('Focus finito', MSG.end);
      return;
    }
    for (const r of sRef.current.settings.reminders) {
      if (!r.on || !r.everyMin) continue;
      const due = (firedRem.current[r.id] ?? t0) + r.everyMin * 60000;
      if (now >= due) {
        firedRem.current[r.id] = now;
        ui.toast(r.text);
        void notify('Promemoria', r.text);
      }
    }
  }, [now, phase, endsAt, t0, ui]);

  const remaining = phase === 'rest' ? left0 : endsAt ? Math.max(0, endsAt - now) : 0;
  const elapsed = t0 ? now - t0 : 0;
  const frac = minutes && (phase === 'run' || phase === 'rest' || phase === 'end') ? 1 - remaining / (minutes * 60000) : 0;

  const message = useMemo(() => {
    if (phase === 'end') return MSG.end;
    if (phase === 'rest') return MSG.rest;
    if (off) return MSG.off;
    if (phase === 'idle') return MSG.idle;
    const i = Math.floor(elapsed / 90_000);
    return i === 0 ? MSG.start : MSG.mid[i % MSG.mid.length];
  }, [phase, off, elapsed]);

  const zones = s.zones;
  const R = 118;
  const C = 2 * Math.PI * R;

  return (
    <div className={`focus${off ? ' off' : ''}${phase === 'rest' ? ' rest' : ''}`} role="dialog" aria-modal="true" aria-label="Modalità Focus">
      <button className="focus-x" onClick={exit} aria-label="Esci dal Focus">
        <IconClose size={20} />
      </button>

      {!cp || !usable ? (
        <div className="focus-c">
          <p className="turn-text">Niente da fare qui, adesso.</p>
          <p className="muted">{cp ? 'Questo checkpoint è in attesa di un altro.' : 'Hai raggiunto la destinazione.'}</p>
          <Btn kind="primary" onClick={exit}>
            Torna alla mappa
          </Btn>
        </div>
      ) : (
        <div className="focus-c">
          <div className="focus-cp">
            {dest.name} · {cp.title}
          </div>
          <div className="turn-tag center">
            <IconTurn size={16} /> PROSSIMA SVOLTA
          </div>
          <p className="focus-act">{act ? act.text : 'Nessuna azione aperta. Registra il risultato o aggiungi un\'azione.'}</p>

          {(minutes != null || phase !== 'idle') && (
            <div className="ring" aria-live="off">
              <svg viewBox="0 0 260 260" width="240" height="240">
                <circle cx="130" cy="130" r={R} className="ring-bg" />
                <circle cx="130" cy="130" r={R} className="ring-fg" strokeDasharray={`${C * frac} ${C}`} transform="rotate(-90 130 130)" />
              </svg>
              <div className="ring-t">
                {minutes ? clock(remaining || (phase === 'idle' ? minutes * 60000 : 0)) : clock(elapsed)}
                <small>{phase === 'rest' ? 'Riposo' : phase === 'end' ? 'Finito' : phase === 'run' ? 'In focus' : 'Pronto'}</small>
              </div>
            </div>
          )}
          {minutes == null && phase === 'idle' && <div className="ring-t solo">Senza timer</div>}

          <p className="focus-msg">{message}</p>

          {phase === 'idle' && (
            <>
              <div className="chips center" aria-label="Durata">
                {PRESETS.map((m) => (
                  <button key={String(m)} type="button" className={`chip-btn${minutes === m ? ' on' : ''}`} onClick={() => setMinutes(m)}>
                    {m ? `${m} min` : 'Senza timer'}
                  </button>
                ))}
              </div>
              <Btn kind="primary" icon={<IconPlay size={16} />} onClick={start}>
                Inizia il Focus
              </Btn>
            </>
          )}

          {(phase === 'run' || phase === 'rest') && (
            <div className="focus-ctl">
              {off && (
                <Btn kind="primary" onClick={() => setOff(false)}>
                  Torna sulla rotta
                </Btn>
              )}
              {!off && (
                <>
                  <Btn icon={phase === 'rest' ? <IconPlay size={15} /> : <IconCoffee size={17} />} onClick={toggleRest}>
                    {phase === 'rest' ? 'Riprendi' : 'Riposo'}
                  </Btn>
                  {phase === 'run' && <Btn onClick={() => setPick(true)}>Mi sono distratto</Btn>}
                </>
              )}
            </div>
          )}

          {phase === 'end' && (
            <div className="focus-ctl">
              <Btn kind="primary" icon={<IconResult size={17} />} onClick={() => ui.modal({ k: 'result', cpId: cp.id })}>
                Registra risultato
              </Btn>
              <Btn
                onClick={() => {
                  setPhase('idle');
                  setT0(null);
                  setEndsAt(null);
                }}
              >
                Un altro giro
              </Btn>
            </div>
          )}

          {pick && (
            <div className="pick glass">
              <p className="lab">Cosa ti ha distratto?</p>
              <div className="chips center">
                {zones.map((z) => (
                  <button key={z.id} type="button" className="chip-btn" onClick={() => logDistraction(z.id)}>
                    {z.name}
                  </button>
                ))}
                <button type="button" className="chip-btn" onClick={() => logDistraction()}>
                  Altro
                </button>
              </div>
              <Btn kind="ghost" onClick={() => setPick(false)}>
                Annulla
              </Btn>
            </div>
          )}

          {act && (
            <div className="focus-foot">
              <Btn
                icon={<IconCheck size={17} />}
                onClick={() => {
                  completeAction(cp.id, act.id);
                  ui.toast('Azione completata');
                  if (session.current) session.current.actionId = undefined;
                }}
              >
                Completato
              </Btn>
              <Btn icon={<IconBlock size={16} />} onClick={() => ui.modal({ k: 'block', cpId: cp.id, actionId: act.id })}>
                Bloccato
              </Btn>
              <Btn icon={<IconResult size={16} />} onClick={() => ui.modal({ k: 'result', cpId: cp.id })}>
                Registra risultato
              </Btn>
            </div>
          )}
          {phase !== 'idle' && elapsed > 0 && <p className="focus-small">Tempo totale: {fmtDur(elapsed)}</p>}
        </div>
      )}
      <span hidden>
        <IconPause size={1} />
      </span>
    </div>
  );
}
