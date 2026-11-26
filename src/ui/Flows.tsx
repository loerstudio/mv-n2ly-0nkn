import { useMemo, useState } from 'react';
import { cpById, critMet, cur, destById, evidence, metricById, nextAction, openActions, pickStrategy, progress, strategyLetter } from '../lib/engine';
import type { Checkpoint, Metric } from '../lib/types';
import { ago, fmtDate, fmtVal, UNIT_LABEL } from '../lib/util';
import { applyRecalc, blockAction, completeCheckpoint, getState, recordReading, rejectStrategy, undoLastReading, verifyCriterion } from '../store/store';
import { useUI } from './ctx';
import { IconCheck } from './icons';
import { Btn, Field, Modal, Seg, TextList } from './primitives';

const num = (v: string) => {
  const n = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// ── record a metric reading ────────────────────────────────────────────────
export function ReadingForm({ m, onSaved }: { m: Metric; onSaved?: () => void }) {
  const ui = useUI();
  const [v, setV] = useState(m.kind === 'counter' ? '1' : '');
  const [note, setNote] = useState('');
  const c = cur(m);
  const parsed = num(v);
  const after = parsed == null ? null : m.kind === 'counter' ? (c ?? 0) + parsed : parsed;
  const save = () => {
    if (parsed == null) return;
    recordReading(m.id, parsed, note, m.kind === 'counter');
    ui.toast(`${m.label}: ${fmtVal(after, m.unit)}`);
    setV(m.kind === 'counter' ? '1' : '');
    setNote('');
    onSaved?.();
  };
  return (
    <div className="stack">
      <p className="muted">{m.desc}</p>
      <div className="kv">
        <span>Ora</span>
        <strong>{fmtVal(c, m.unit)}</strong>
        {m.log.length > 0 && <em>{ago(m.log[m.log.length - 1].t, ui.now)}</em>}
      </div>
      <Field label={m.kind === 'counter' ? `Quanti nuovi (${UNIT_LABEL[m.unit]})` : `Valore adesso (${UNIT_LABEL[m.unit]})`} hint={m.kind === 'counter' && after != null ? `Totale dopo: ${fmtVal(after, m.unit)}` : undefined}>
        <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
      </Field>
      <Field label="Nota (facoltativa)">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Da dove viene questo numero" />
      </Field>
      <div className="btn-row">
        <Btn kind="primary" full disabled={parsed == null} onClick={save}>
          Registra
        </Btn>
        {m.log.length > 0 && (
          <Btn
            kind="ghost"
            onClick={() => {
              undoLastReading(m.id);
              ui.toast('Ultima misura annullata');
            }}
          >
            Annulla l'ultima
          </Btn>
        )}
      </div>
      {m.log.length > 0 && (
        <div className="mini-log">
          {m.log
            .slice(-4)
            .reverse()
            .map((r) => (
              <div key={r.t}>
                <span>{fmtDate(r.t)}</span>
                <strong>{fmtVal(r.v, m.unit)}</strong>
                {r.note && <em>{r.note}</em>}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function ReadingModal({ metricId }: { metricId: string }) {
  const ui = useUI();
  const m = metricById(getState(), metricId);
  if (!m) return null;
  return (
    <Modal title={m.label} onClose={() => ui.modal(null)}>
      <ReadingForm m={m} onSaved={() => ui.modal(null)} />
    </Modal>
  );
}

// ── Registra risultato ─────────────────────────────────────────────────────
export function ResultModal({ cpId, tab: t0 }: { cpId: string; tab?: 'metrica' | 'criterio' | 'azione' }) {
  const ui = useUI();
  const s = getState();
  const cp = cpById(s, cpId)!;
  const [tab, setTab] = useState(t0 ?? 'metrica');
  const ids = useMemo(() => {
    const out: string[] = [];
    for (const c of cp.criteria) if (c.target && !out.includes(c.target.metricId)) out.push(c.target.metricId);
    for (const t of cp.targets) if (!out.includes(t.metricId)) out.push(t.metricId);
    return out;
  }, [cp]);
  const [mid, setMid] = useState(ids[0] ?? '');
  const manual = cp.criteria.filter((c) => !c.target && !c.done);
  const [cid, setCid] = useState(manual[0]?.id ?? '');
  const [ev, setEv] = useState('');
  const m = metricById(s, mid);
  const act = nextAction(cp);

  return (
    <Modal title="Registra risultato" onClose={() => ui.modal(null)}>
      <p className="muted">Misura i risultati, non lo sforzo. Registra solo ciò che puoi verificare.</p>
      <Seg
        value={tab}
        onChange={setTab}
        options={[
          { v: 'metrica', l: 'Una misura' },
          { v: 'criterio', l: 'Un criterio' },
          { v: 'azione', l: 'Non ha funzionato' },
        ]}
      />
      {tab === 'metrica' && (
        <div className="stack">
          {ids.length === 0 ? (
            <p className="muted">Questo checkpoint non ha metriche. Aggiungine in «Modifica checkpoint» oppure usa la scheda «Un criterio».</p>
          ) : (
            <>
              <Field label="Metrica">
                <select value={mid} onChange={(e) => setMid(e.target.value)}>
                  {ids.map((id) => (
                    <option key={id} value={id}>
                      {metricById(s, id)?.label}
                    </option>
                  ))}
                </select>
              </Field>
              {m && <ReadingForm key={m.id} m={m} onSaved={() => ui.modal(null)} />}
            </>
          )}
        </div>
      )}
      {tab === 'criterio' && (
        <div className="stack">
          {manual.length === 0 ? (
            <p className="muted">Non ci sono criteri da verificare a mano. I criteri con una metrica si aggiornano da soli quando registri le misure.</p>
          ) : (
            <>
              <Field label="Criterio">
                <select value={cid} onChange={(e) => setCid(e.target.value)}>
                  {manual.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.text}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Evidenza" hint="Cosa hai visto o ottenuto, in modo che si possa verificare (data, importo, nome, link).">
                <textarea rows={3} value={ev} onChange={(e) => setEv(e.target.value)} />
              </Field>
              <Btn
                kind="primary"
                full
                disabled={ev.trim().length < 4 || !cid}
                onClick={() => {
                  verifyCriterion(cp.id, cid, ev);
                  ui.toast('Criterio verificato');
                  ui.modal(null);
                }}
              >
                Verifica il criterio
              </Btn>
            </>
          )}
        </div>
      )}
      {tab === 'azione' && (
        <div className="stack">
          <p className="body">{act ? `«${act.text}»` : 'Nessuna azione aperta.'}</p>
          <p className="muted">Se un'azione non ha prodotto il risultato atteso non cambi destinazione: registri cosa è successo, scegli un ostacolo e approvi una correzione.</p>
          <Btn kind="primary" full onClick={() => ui.modal({ k: 'recalc', cpId: cp.id, actionId: act?.id })}>
            Registra l'esito e ricalcola
          </Btn>
        </div>
      )}
    </Modal>
  );
}

// ── Bloccato ───────────────────────────────────────────────────────────────
const BLOCK_REASONS = ['Aspetto una risposta', 'Mi manca un\'informazione', 'Mi manca una risorsa', 'Non so come farla', 'Altro'];

export function BlockModal({ cpId, actionId }: { cpId: string; actionId: string }) {
  const ui = useUI();
  const cp = cpById(getState(), cpId)!;
  const a = cp.actions.find((x) => x.id === actionId)!;
  const [reason, setReason] = useState(BLOCK_REASONS[0]);
  const [detail, setDetail] = useState('');
  const text = [reason === 'Altro' ? '' : reason, detail.trim()].filter(Boolean).join(' — ');
  return (
    <Modal title="Cosa ti blocca?" onClose={() => ui.modal(null)}>
      <p className="body">«{a.text}»</p>
      <div className="chips">
        {BLOCK_REASONS.map((r) => (
          <button key={r} type="button" className={`chip-btn${reason === r ? ' on' : ''}`} onClick={() => setReason(r)}>
            {r}
          </button>
        ))}
      </div>
      <Field label="Dettaglio" hint="Più è specifico, meglio il percorso può essere ricalcolato.">
        <textarea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </Field>
      <div className="btn-row">
        <Btn
          kind="primary"
          full
          disabled={!text}
          onClick={() => {
            blockAction(cpId, actionId, text);
            ui.toast('Azione bloccata. Puoi ricalcolare il percorso.');
            ui.modal(null);
          }}
        >
          Segna come bloccata
        </Btn>
      </div>
    </Modal>
  );
}

// ── Verifica criterio ──────────────────────────────────────────────────────
export function VerifyModal({ cpId, critId }: { cpId: string; critId: string }) {
  const ui = useUI();
  const cp = cpById(getState(), cpId)!;
  const c = cp.criteria.find((x) => x.id === critId)!;
  const [ev, setEv] = useState('');
  return (
    <Modal title="Verifica criterio" onClose={() => ui.modal(null)}>
      <p className="body">{c.text}</p>
      <Field label="Evidenza" hint="Cosa hai visto o ottenuto. Un criterio senza evidenza non conta come raggiunto.">
        <textarea rows={3} value={ev} onChange={(e) => setEv(e.target.value)} autoFocus />
      </Field>
      <Btn
        kind="primary"
        full
        disabled={ev.trim().length < 4}
        onClick={() => {
          verifyCriterion(cpId, critId, ev);
          ui.toast('Criterio verificato');
          ui.modal(null);
        }}
      >
        Verifica
      </Btn>
    </Modal>
  );
}

// ── Checkpoint raggiunto ───────────────────────────────────────────────────
export function DoneModal({ cpId }: { cpId: string }) {
  const ui = useUI();
  const s = getState();
  const cp = cpById(s, cpId)!;
  const [note, setNote] = useState('');
  const p = progress(s, cp);
  return (
    <Modal title="Checkpoint raggiunto?" onClose={() => ui.modal(null)}>
      <p className="body">{cp.result}</p>
      <div className="group">
        {cp.criteria.map((c) => (
          <div className="crit" key={c.id}>
            <span className={`tick${critMet(s, c) ? ' on' : ''}`}>{critMet(s, c) && <IconCheck size={14} />}</span>
            <div className="crit-b">
              <div className="crit-t">{c.text}</div>
            </div>
          </div>
        ))}
      </div>
      {!p.complete && <p className="warn-text">Non tutti i criteri sono verificati. Confermando, dichiari il checkpoint raggiunto lo stesso e resta nello storico.</p>}
      <Field label="Nota (facoltativa)">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cosa ha fatto la differenza" />
      </Field>
      <Btn
        kind="primary"
        full
        onClick={() => {
          completeCheckpoint(cpId, note);
          ui.toast('Checkpoint raggiunto. La rotta avanza.');
          ui.modal(null);
          ui.go({ k: 'home' });
          ui.detent('base');
        }}
      >
        Sì, è raggiunto
      </Btn>
    </Modal>
  );
}

// ── Ricalcola percorso: 7 passi, destinazione invariata ────────────────────
export function RecalcModal({ cpId, actionId }: { cpId: string; actionId?: string }) {
  const ui = useUI();
  const s0 = getState();
  const cp0 = cpById(s0, cpId)!;
  const dest = destById(s0, cp0.destId)!;
  const [step, setStep] = useState(1);
  const [outcome, setOutcome] = useState<'fallita' | 'nessun-risultato' | 'bloccata'>(cp0.actions.find((a) => a.id === actionId)?.status === 'blocked' ? 'bloccata' : 'fallita');
  const [aid, setAid] = useState(actionId ?? '');
  const [what, setWhat] = useState('');
  const [obs, setObs] = useState<string>(cp0.obstacles[0]?.id ?? 'altro');
  const [custom, setCustom] = useState('');
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const [manual, setManual] = useState(false);
  const [mTitle, setMTitle] = useState('');
  const [mSteps, setMSteps] = useState<string[]>(['']);

  // always read the freshest checkpoint (a rejection changes it)
  const cp: Checkpoint = cpById(getState(), cpId) ?? cp0;
  const open = openActions(cp);
  const obstacleId = obs === 'altro' ? undefined : obs;
  const lines = useMemo(() => evidence(getState(), cp, obstacleId, ui.now), [cp, obstacleId, ui.now]);
  const proposal = strategyId ? cp.strategies.find((x) => x.id === strategyId) ?? null : null;

  const goPropose = () => {
    const pick = pickStrategy(cp, obstacleId);
    setStrategyId(pick?.id ?? null);
    setSteps(pick ? [...pick.steps] : []);
    setManual(!pick);
    setStep(4);
  };
  const reject = () => {
    if (!proposal) return;
    rejectStrategy(cp.id, proposal.id);
    const next = pickStrategy(getState().checkpoints.find((c) => c.id === cp.id)!, obstacleId, [proposal.id]);
    setStrategyId(next?.id ?? null);
    setSteps(next ? [...next.steps] : []);
    setManual(!next);
  };
  const finish = (mode: 'strategy' | 'manual' | 'none') => {
    applyRecalc({
      cpId: cp.id,
      actionId: aid || undefined,
      outcome,
      what,
      obstacleId,
      customObstacle: obs === 'altro' ? custom : undefined,
      strategyId: mode === 'strategy' ? strategyId ?? undefined : undefined,
      steps: mode === 'strategy' ? steps.filter((x) => x.trim()) : undefined,
      manual: mode === 'manual' ? { title: mTitle, steps: mSteps.filter((x) => x.trim()) } : undefined,
    });
    ui.toast('Percorso ricalcolato. Destinazione invariata.');
    ui.modal(null);
    ui.go({ k: 'home' });
    ui.detent('base');
  };

  const titles = ['', 'Cosa è successo', 'Quale ostacolo', 'Le evidenze', 'Correzione proposta'];
  return (
    <Modal
      title="Ricalcola percorso"
      tall
      onClose={() => ui.modal(null)}
      foot={
        step < 4 ? (
          <div className="btn-row">
            {step > 1 && (
              <Btn kind="ghost" onClick={() => setStep(step - 1)}>
                Indietro
              </Btn>
            )}
            <Btn
              kind="primary"
              full
              disabled={(step === 1 && what.trim().length < 4) || (step === 2 && obs === 'altro' && custom.trim().length < 3)}
              onClick={() => (step === 3 ? goPropose() : setStep(step + 1))}
            >
              {step === 3 ? 'Proponi una correzione' : 'Continua'}
            </Btn>
          </div>
        ) : undefined
      }
    >
      <div className="steps" aria-label={`Passo ${step} di 4`}>
        {[1, 2, 3, 4].map((n) => (
          <i key={n} className={n <= step ? 'on' : ''} />
        ))}
      </div>
      <h3 className="step-t">{titles[step]}</h3>
      <p className="dest-keep">
        Destinazione invariata: <strong>{dest.name}</strong> — {dest.goal}
      </p>

      {step === 1 && (
        <div className="stack">
          <Seg
            value={outcome}
            onChange={setOutcome}
            options={[
              { v: 'fallita', l: 'Fallita' },
              { v: 'nessun-risultato', l: 'Nessun risultato' },
              { v: 'bloccata', l: 'Bloccata' },
            ]}
          />
          <Field label="Azione">
            <select value={aid} onChange={(e) => setAid(e.target.value)}>
              <option value="">Nessuna azione in particolare</option>
              {open.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.text}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cosa è successo, con i fatti" hint="Numeri, risposte ricevute, cosa hai visto. Non cosa hai provato.">
            <textarea rows={4} value={what} onChange={(e) => setWhat(e.target.value)} autoFocus />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <p className="muted">Qual è l'ostacolo più probabile? Scegli quello che i fatti confermano meglio.</p>
          <div className="radio-list">
            {cp.obstacles.map((o) => (
              <button key={o.id} type="button" className={`radio${obs === o.id ? ' on' : ''}`} onClick={() => setObs(o.id)}>
                <i />
                <span>{o.text}</span>
              </button>
            ))}
            <button type="button" className={`radio${obs === 'altro' ? ' on' : ''}`} onClick={() => setObs('altro')}>
              <i />
              <span>Altro ostacolo</span>
            </button>
          </div>
          {obs === 'altro' && (
            <Field label="Descrivi l'ostacolo">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} autoFocus />
            </Field>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <p className="muted">Questo è ciò che i dati registrati dicono adesso. Nessuna ipotesi aggiunta.</p>
          <ul className="plain ev">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p className="muted">Le correzioni già inefficaci non vengono riproposte.</p>
        </div>
      )}

      {step === 4 && (
        <div className="stack">
          {!manual && proposal ? (
            <>
              <div className="proposal">
                <div className="prop-tag">Correzione {strategyLetter(cp, proposal)}</div>
                <h4>{proposal.title}</h4>
                <p className="muted">Quando serve: {proposal.when}</p>
              </div>
              <p className="lab">Nuove azioni (puoi modificarle)</p>
              <TextList items={steps} onChange={setSteps} add="Aggiungi passo" />
              <p className="muted">Diventeranno le prime azioni del checkpoint. Le azioni già pianificate restano dopo.</p>
              <div className="btn-col">
                <Btn kind="primary" full disabled={steps.filter((x) => x.trim()).length === 0} onClick={() => finish('strategy')}>
                  Approva e ricalcola
                </Btn>
                <div className="btn-row">
                  <Btn full onClick={reject}>
                    Rifiuta, mostrane un'altra
                  </Btn>
                  <Btn full onClick={() => setManual(true)}>
                    Scrivo la mia
                  </Btn>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="muted">{proposal ? 'Scrivi una correzione tua.' : 'Le strategie preparate per questo checkpoint sono finite o già inefficaci. Scrivi una nuova correzione specifica: una sola variabile da cambiare.'}</p>
              <Field label="Cosa cambi">
                <input value={mTitle} onChange={(e) => setMTitle(e.target.value)} autoFocus />
              </Field>
              <p className="lab">Passi concreti</p>
              <TextList items={mSteps} onChange={setMSteps} add="Aggiungi passo" />
              <div className="btn-col">
                <Btn kind="primary" full disabled={mTitle.trim().length < 3 || mSteps.filter((x) => x.trim()).length === 0} onClick={() => finish('manual')}>
                  Approva e ricalcola
                </Btn>
                {proposal && (
                  <Btn kind="ghost" onClick={() => setManual(false)}>
                    Torna alla proposta
                  </Btn>
                )}
              </div>
            </>
          )}
          <Btn kind="ghost" onClick={() => finish('none')}>
            Registra solo il risultato, senza correzione
          </Btn>
        </div>
      )}
    </Modal>
  );
}

export function ConfirmModal({ title, body, ok, danger, onOk }: { title: string; body: string; ok: string; danger?: boolean; onOk: () => void }) {
  const ui = useUI();
  return (
    <Modal title={title} onClose={() => ui.modal(null)}>
      <p className="body">{body}</p>
      <div className="btn-row">
        <Btn kind="ghost" onClick={() => ui.modal(null)}>
          Annulla
        </Btn>
        <Btn
          kind={danger ? 'danger' : 'primary'}
          full
          onClick={() => {
            ui.modal(null);
            onOk();
          }}
        >
          {ok}
        </Btn>
      </div>
    </Modal>
  );
}
