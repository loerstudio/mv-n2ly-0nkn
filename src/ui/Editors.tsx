import { useState } from 'react';
import { cpsOf, destById } from '../lib/engine';
import type { Action, Checkpoint, Criterion, Destination, Metric, Strategy, Unit, Zone } from '../lib/types';
import { newId } from '../lib/util';
import { deleteCheckpoint, deleteDestination, deleteMetric, deleteZone, getState, moveCheckpoint, saveCheckpoint, saveDestination, saveMetric, saveZone } from '../store/store';
import { useUI } from './ctx';
import { IconDown, IconPlus, IconTrash, IconUp } from './icons';
import { Btn, Field, Modal, TextList } from './primitives';

const clone = <T,>(v: T): T => structuredClone(v);

function ActionsEditor({ actions, onChange }: { actions: Action[]; onChange: (a: Action[]) => void }) {
  const set = (i: number, text: string) => onChange(actions.map((a, j) => (j === i ? { ...a, text } : a)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= actions.length) return;
    const c = [...actions];
    [c[i], c[j]] = [c[j], c[i]];
    onChange(c);
  };
  const label: Record<string, string> = { todo: 'Da fare', doing: 'In corso', done: 'Fatta', blocked: 'Bloccata', failed: 'Non ha funzionato' };
  return (
    <div className="tl">
      {actions.map((a, i) => (
        <div className="tl-row" key={a.id}>
          <div className="grow">
            <textarea value={a.text} rows={2} onChange={(e) => set(i, e.target.value)} aria-label={`Azione ${i + 1}`} />
            <span className={`mini-status ${a.status}`}>{label[a.status]}</span>
          </div>
          <div className="tl-btns">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Su">
              <IconUp size={14} />
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === actions.length - 1} aria-label="Giù">
              <IconDown size={14} />
            </button>
            <button type="button" onClick={() => onChange(actions.filter((_, j) => j !== i))} aria-label="Elimina">
              <IconTrash size={14} />
            </button>
          </div>
        </div>
      ))}
      <Btn small kind="tint" icon={<IconPlus size={15} />} onClick={() => onChange([...actions, { id: newId('a'), text: '', status: 'todo', createdAt: Date.now() }])}>
        Aggiungi azione
      </Btn>
    </div>
  );
}

function CriteriaEditor({ items, onChange }: { items: Criterion[]; onChange: (c: Criterion[]) => void }) {
  const s = getState();
  const set = (i: number, patch: Partial<Criterion>) => onChange(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="tl">
      {items.map((c, i) => (
        <div className="crit-ed" key={c.id}>
          <textarea value={c.text} rows={2} onChange={(e) => set(i, { text: e.target.value })} aria-label={`Criterio ${i + 1}`} />
          <div className="crit-ed-row">
            <select
              value={c.target ? 'metric' : 'manual'}
              onChange={(e) => (e.target.value === 'manual' || !s.metrics.length ? set(i, { target: undefined }) : set(i, { target: { metricId: s.metrics[0].id, value: 1, dir: 'gte' } }))}
              aria-label="Tipo di criterio"
            >
              <option value="manual">Si verifica a mano, con evidenza</option>
              <option value="metric" disabled={!s.metrics.length}>
                {s.metrics.length ? 'Si misura con una metrica' : 'Si misura con una metrica (prima creane una in Numeri)'}
              </option>
            </select>
            <button type="button" className="icon-btn" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Elimina criterio">
              <IconTrash size={16} />
            </button>
          </div>
          {c.target && (
            <div className="crit-ed-row wrap">
              <select value={c.target.metricId} onChange={(e) => set(i, { target: { ...c.target!, metricId: e.target.value } })} aria-label="Metrica">
                {s.metrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select value={c.target.dir} onChange={(e) => set(i, { target: { ...c.target!, dir: e.target.value as 'gte' | 'lte' | 'any' } })} aria-label="Confronto">
                <option value="gte">almeno</option>
                <option value="lte">al massimo</option>
                <option value="any">esiste una misura</option>
              </select>
              {c.target.dir !== 'any' && (
                <>
                  <select
                    value={c.target.ref ?? ''}
                    onChange={(e) => set(i, { target: { ...c.target!, ref: e.target.value || undefined } })}
                    aria-label="Rispetto a"
                  >
                    <option value="">un valore fisso</option>
                    {s.metrics.map((m) => (
                      <option key={m.id} value={m.id}>
                        rispetto a: {m.label}
                      </option>
                    ))}
                  </select>
                  {c.target.ref ? (
                    <input
                      inputMode="decimal"
                      value={String(c.target.mult ?? 1)}
                      onChange={(e) => set(i, { target: { ...c.target!, mult: parseFloat(e.target.value.replace(',', '.')) || 1 } })}
                      aria-label="Moltiplicatore"
                      className="num"
                    />
                  ) : (
                    <input
                      inputMode="decimal"
                      value={String(c.target.value)}
                      onChange={(e) => set(i, { target: { ...c.target!, value: parseFloat(e.target.value.replace(',', '.')) || 0 } })}
                      aria-label="Valore"
                      className="num"
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      ))}
      <Btn small kind="tint" icon={<IconPlus size={15} />} onClick={() => onChange([...items, { id: newId('c'), text: '' }])}>
        Aggiungi criterio
      </Btn>
    </div>
  );
}

function StrategiesEditor({ items, obstacles, onChange }: { items: Strategy[]; obstacles: Checkpoint['obstacles']; onChange: (s: Strategy[]) => void }) {
  const set = (i: number, patch: Partial<Strategy>) => onChange(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="tl">
      {items.map((st, i) => (
        <div className="strat-ed" key={st.id}>
          <div className="strat-h">
            <strong>{String.fromCharCode(65 + Math.min(i, 25))}</strong>
            <input value={st.title} onChange={(e) => set(i, { title: e.target.value })} aria-label="Titolo della strategia" />
            <button type="button" className="icon-btn" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Elimina strategia">
              <IconTrash size={16} />
            </button>
          </div>
          <Field label="Quando si usa">
            <input value={st.when} onChange={(e) => set(i, { when: e.target.value })} />
          </Field>
          <div className="crit-ed-row wrap">
            <select value={st.obstacleId ?? ''} onChange={(e) => set(i, { obstacleId: e.target.value || undefined })} aria-label="Ostacolo">
              <option value="">Qualsiasi ostacolo</option>
              {obstacles.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.text}
                </option>
              ))}
            </select>
            <select value={st.status} onChange={(e) => set(i, { status: e.target.value as Strategy['status'], appliedAt: e.target.value === 'ready' ? undefined : st.appliedAt })} aria-label="Stato">
              <option value="ready">Pronta (nascosta)</option>
              <option value="applied">In corso</option>
              <option value="rejected">Rifiutata</option>
              <option value="ineffective">Inefficace</option>
              <option value="worked">Ha funzionato</option>
            </select>
          </div>
          <TextList items={st.steps} onChange={(steps) => set(i, { steps })} add="Aggiungi passo" />
        </div>
      ))}
      {items.length < 26 && (
        <Btn small kind="tint" icon={<IconPlus size={15} />} onClick={() => onChange([...items, { id: newId('s'), title: '', when: '', steps: [''], status: 'ready', manual: true }])}>
          Aggiungi strategia ({String.fromCharCode(65 + items.length)})
        </Btn>
      )}
    </div>
  );
}

export function EditCheckpointModal({ cpId, destId }: { cpId: string | null; destId?: string }) {
  const ui = useUI();
  const s = getState();
  const existing = cpId ? s.checkpoints.find((c) => c.id === cpId) : undefined;
  const dId = existing?.destId ?? destId ?? s.activeDestId;
  const [cp, setCp] = useState<Checkpoint>(() =>
    existing
      ? clone(existing)
      : {
          id: newId('cp'),
          destId: dId,
          title: '',
          result: '',
          why: '',
          prereqs: [],
          deps: [],
          actions: [],
          targets: [],
          resources: [],
          obstacles: [],
          criteria: [],
          strategies: [],
        },
  );
  const set = (patch: Partial<Checkpoint>) => setCp((c) => ({ ...c, ...patch }));
  const others = s.checkpoints.filter((c) => c.id !== cp.id);
  const valid = cp.title.trim() && cp.result.trim() && cp.criteria.some((c) => c.text.trim());

  const save = () => {
    const out: Checkpoint = {
      ...cp,
      title: cp.title.trim(),
      result: cp.result.trim(),
      why: cp.why.trim(),
      prereqs: cp.prereqs.filter((x) => x.trim()),
      resources: cp.resources.filter((x) => x.trim()),
      actions: cp.actions.filter((a) => a.text.trim()).map((a) => ({ ...a, text: a.text.trim() })),
      criteria: cp.criteria.filter((c) => c.text.trim()),
      strategies: cp.strategies.filter((x) => x.title.trim()).map((x) => ({ ...x, steps: x.steps.filter((y) => y.trim()) })),
      obstacles: cp.obstacles.filter((o) => o.text.trim()),
    };
    const ids = new Set(out.obstacles.map((o) => o.id));
    out.strategies = out.strategies.map((x) => (x.obstacleId && !ids.has(x.obstacleId) ? { ...x, obstacleId: undefined } : x));
    if (!existing && !cpsOf(s, out.destId).length) out.activatedAt = Date.now();
    saveCheckpoint(out);
    ui.toast('Checkpoint salvato');
    ui.modal(null);
  };

  return (
    <Modal
      title={existing ? 'Modifica checkpoint' : 'Nuovo checkpoint'}
      tall
      onClose={() => ui.modal(null)}
      foot={
        <div className="btn-row">
          {existing && (
            <Btn
              kind="danger"
              icon={<IconTrash size={16} />}
              title="Elimina"
              onClick={() =>
                ui.modal({
                  k: 'confirm',
                  title: 'Eliminare il checkpoint?',
                  body: `«${existing.title}» sparisce dalla rotta con le sue azioni e strategie. Non si può annullare (puoi ripristinare un backup).`,
                  ok: 'Elimina',
                  danger: true,
                  onOk: () => {
                    deleteCheckpoint(existing.id);
                    ui.go({ k: 'home' });
                  },
                })
              }
            />
          )}
          <Btn kind="primary" full disabled={!valid} onClick={save}>
            Salva
          </Btn>
        </div>
      }
    >
      <div className="form">
        <Field label="Titolo">
          <input value={cp.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Risultato esatto da raggiungere" hint="Una frase verificabile: cosa è vero quando il checkpoint è raggiunto.">
          <textarea rows={3} value={cp.result} onChange={(e) => set({ result: e.target.value })} />
        </Field>
        <Field label="Perché è necessario">
          <textarea rows={3} value={cp.why} onChange={(e) => set({ why: e.target.value })} />
        </Field>
        <h4 className="form-h">Criteri di completamento</h4>
        <p className="muted">Almeno uno: senza criteri verificabili un checkpoint non può essere raggiunto.</p>
        <CriteriaEditor items={cp.criteria} onChange={(criteria) => set({ criteria })} />
        <h4 className="form-h">Azioni, in ordine di priorità</h4>
        <ActionsEditor actions={cp.actions} onChange={(actions) => set({ actions })} />
        <h4 className="form-h">Altre metriche da seguire</h4>
        <div className="checks">
          {s.metrics.map((m) => (
            <label key={m.id} className="check">
              <input
                type="checkbox"
                checked={cp.targets.some((t) => t.metricId === m.id)}
                onChange={(e) => set({ targets: e.target.checked ? [...cp.targets, { metricId: m.id, value: 0, dir: 'any' }] : cp.targets.filter((t) => t.metricId !== m.id) })}
              />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
        <h4 className="form-h">Prerequisiti</h4>
        <TextList items={cp.prereqs} onChange={(prereqs) => set({ prereqs })} add="Aggiungi prerequisito" rows={1} />
        <h4 className="form-h">Dipende anche da</h4>
        <div className="checks tall">
          {others.map((c) => (
            <label key={c.id} className="check">
              <input type="checkbox" checked={cp.deps.includes(c.id)} onChange={(e) => set({ deps: e.target.checked ? [...cp.deps, c.id] : cp.deps.filter((x) => x !== c.id) })} />
              <span>
                {c.title} <em>({destById(s, c.destId)?.name})</em>
              </span>
            </label>
          ))}
        </div>
        <h4 className="form-h">Risorse necessarie</h4>
        <TextList items={cp.resources} onChange={(resources) => set({ resources })} add="Aggiungi risorsa" rows={1} />
        <h4 className="form-h">Ostacoli prevedibili</h4>
        <TextList
          items={cp.obstacles.map((o) => o.text)}
          onChange={(txt) => set({ obstacles: txt.map((t, i) => ({ id: cp.obstacles[i]?.id ?? newId('o'), text: t })) })}
          add="Aggiungi ostacolo"
          rows={1}
        />
        <h4 className="form-h">Strategie correttive (da A a Z)</h4>
        <p className="muted">Restano nascoste finché un'azione non fallisce. L'ordine è quello in cui vengono proposte.</p>
        <StrategiesEditor items={cp.strategies} obstacles={cp.obstacles} onChange={(strategies) => set({ strategies })} />
        {existing && (
          <div className="btn-row">
            <Btn small icon={<IconUp size={14} />} onClick={() => moveCheckpoint(existing.id, -1)}>
              Anticipa nella rotta
            </Btn>
            <Btn small icon={<IconDown size={14} />} onClick={() => moveCheckpoint(existing.id, 1)}>
              Posticipa nella rotta
            </Btn>
          </div>
        )}
      </div>
    </Modal>
  );
}

const SUGGESTED = ['PATRIMONIO', 'AMICIZIE', 'FAMIGLIA', 'IMPERO IMPRENDITORIALE', 'SALUTE MENTALE', 'SCOPO PERSONALE'];

export function EditDestModal({ destId }: { destId: string | null }) {
  const ui = useUI();
  const s = getState();
  const existing = destId ? destById(s, destId) : undefined;
  const [d, setD] = useState<Destination>(existing ? { ...existing } : { id: newId('dest'), tag: '', name: '', goal: '', start: '', createdAt: Date.now() });
  const [cpTitle, setCpTitle] = useState('');
  const [cpResult, setCpResult] = useState('');
  const [act, setAct] = useState('');
  const [crit, setCrit] = useState('');
  const valid = d.name.trim() && d.goal.trim() && (existing || (cpTitle.trim() && cpResult.trim() && act.trim() && crit.trim()));
  const save = () => {
    const dest: Destination = { ...d, name: d.name.trim(), goal: d.goal.trim(), start: d.start.trim(), tag: (d.tag || d.name).trim().toUpperCase() };
    if (existing) saveDestination(dest);
    else {
      const first: Checkpoint = {
        id: newId('cp'),
        destId: dest.id,
        title: cpTitle.trim(),
        result: cpResult.trim(),
        why: `Primo passo verso: ${dest.goal}`,
        prereqs: [],
        deps: [],
        actions: [{ id: newId('a'), text: act.trim(), status: 'todo', createdAt: Date.now() }],
        targets: [],
        resources: [],
        obstacles: [],
        criteria: [{ id: newId('c'), text: crit.trim() }],
        strategies: [],
        activatedAt: Date.now(),
      };
      saveDestination(dest, first);
    }
    ui.toast(existing ? 'Destinazione salvata' : 'Nuova destinazione creata');
    ui.modal(null);
    if (!existing) {
      ui.go({ k: 'home' });
      ui.detent('half');
    }
  };
  return (
    <Modal
      title={existing ? 'Modifica destinazione' : 'Nuova destinazione'}
      tall
      onClose={() => ui.modal(null)}
      foot={
        <div className="btn-row">
          {existing && s.destinations.length > 1 && (
            <Btn
              kind="danger"
              icon={<IconTrash size={16} />}
              title="Elimina"
              onClick={() =>
                ui.modal({
                  k: 'confirm',
                  title: 'Eliminare la destinazione?',
                  body: `«${existing.name}» e tutti i suoi checkpoint spariscono dalla rotta. Le metriche restano.`,
                  ok: 'Elimina',
                  danger: true,
                  onOk: () => {
                    deleteDestination(existing.id);
                    ui.go({ k: 'home' });
                  },
                })
              }
            />
          )}
          <Btn kind="primary" full disabled={!valid} onClick={save}>
            Salva
          </Btn>
        </div>
      }
    >
      <div className="form">
        {!existing && (
          <>
            <p className="muted">La destinazione resta invariata: cambia solo il percorso. Scegli un nome tuo o parti da un suggerimento.</p>
            <div className="chips">
              {SUGGESTED.map((t) => (
                <button key={t} type="button" className={`chip-btn${d.name === t ? ' on' : ''}`} onClick={() => setD({ ...d, name: t, tag: t })}>
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
        <Field label="Nome">
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label="Obiettivo, in modo misurabile">
          <textarea rows={2} value={d.goal} onChange={(e) => setD({ ...d, goal: e.target.value })} />
        </Field>
        <Field label="Posizione di partenza" hint="Dove sei oggi, con i fatti. Niente stime ottimistiche.">
          <textarea rows={3} value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} />
        </Field>
        {!existing && (
          <>
            <h4 className="form-h">Primo checkpoint</h4>
            <Field label="Titolo">
              <input value={cpTitle} onChange={(e) => setCpTitle(e.target.value)} />
            </Field>
            <Field label="Risultato esatto da raggiungere">
              <textarea rows={2} value={cpResult} onChange={(e) => setCpResult(e.target.value)} />
            </Field>
            <Field label="Prima azione, specifica">
              <textarea rows={2} value={act} onChange={(e) => setAct(e.target.value)} />
            </Field>
            <Field label="Come verifichi che è raggiunto">
              <textarea rows={2} value={crit} onChange={(e) => setCrit(e.target.value)} />
            </Field>
            <p className="muted">Potrai aggiungere gli altri checkpoint, le metriche e le strategie correttive da «Modifica checkpoint».</p>
          </>
        )}
      </div>
    </Modal>
  );
}

export function ZoneModal({ id }: { id: string | null }) {
  const ui = useUI();
  const s = getState();
  const existing = id ? s.zones.find((z) => z.id === id) : undefined;
  const [z, setZ] = useState<Zone>(existing ? { ...existing } : { id: newId('z'), name: '', signal: '', counter: '' });
  const hits = s.focus.reduce((n, f) => n + f.distractions.filter((d) => d.zoneId === z.id).length, 0);
  return (
    <Modal
      title={existing ? z.name : 'Nuova zona di rischio'}
      onClose={() => ui.modal(null)}
      foot={
        <div className="btn-row">
          {existing && (
            <Btn
              kind="danger"
              icon={<IconTrash size={16} />}
              title="Elimina"
              onClick={() => {
                deleteZone(z.id);
                ui.modal(null);
              }}
            />
          )}
          <Btn
            kind="primary"
            full
            disabled={!z.name.trim()}
            onClick={() => {
              saveZone({ ...z, name: z.name.trim() });
              ui.modal(null);
            }}
          >
            Salva
          </Btn>
        </div>
      }
    >
      <p className="muted">Uno scenario personale da evitare, non un giudizio sulle scelte degli altri.</p>
      {hits > 0 && <p className="warn-text">Segnata {hits} {hits === 1 ? 'volta' : 'volte'} durante il Focus.</p>}
      <div className="form">
        <Field label="Nome">
          <input value={z.name} onChange={(e) => setZ({ ...z, name: e.target.value })} />
        </Field>
        <Field label="Come la riconosco">
          <textarea rows={3} value={z.signal} onChange={(e) => setZ({ ...z, signal: e.target.value })} />
        </Field>
        <Field label="Cosa faccio per restare sulla rotta">
          <textarea rows={3} value={z.counter} onChange={(e) => setZ({ ...z, counter: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

const UNITS: { v: Unit; l: string }[] = [
  { v: 'n', l: 'Numero' },
  { v: 'eur', l: 'Euro' },
  { v: 'pct', l: 'Percentuale' },
  { v: 'kg', l: 'Chilogrammi' },
  { v: 'cm', l: 'Centimetri' },
  { v: 'h', l: 'Ore' },
];

export function MetricModal({ id }: { id: string | null }) {
  const ui = useUI();
  const s = getState();
  const existing = id ? s.metrics.find((m) => m.id === id) : undefined;
  const [m, setM] = useState<Metric>(existing ? clone(existing) : { id: newId('m'), label: '', unit: 'n', kind: 'gauge', desc: '', log: [], destId: s.activeDestId });
  return (
    <Modal
      title={existing ? 'Modifica metrica' : 'Nuova metrica'}
      onClose={() => ui.modal(null)}
      foot={
        <div className="btn-row">
          {existing && (
            <Btn
              kind="danger"
              icon={<IconTrash size={16} />}
              title="Elimina"
              onClick={() =>
                ui.modal({
                  k: 'confirm',
                  title: 'Eliminare la metrica?',
                  body: 'Le sue misure spariscono e i criteri che la usano vengono rimossi.',
                  ok: 'Elimina',
                  danger: true,
                  onOk: () => deleteMetric(m.id),
                })
              }
            />
          )}
          <Btn
            kind="primary"
            full
            disabled={!m.label.trim()}
            onClick={() => {
              saveMetric({ ...m, label: m.label.trim(), desc: m.desc.trim() });
              ui.modal(null);
            }}
          >
            Salva
          </Btn>
        </div>
      }
    >
      <div className="form">
        <Field label="Nome">
          <input value={m.label} onChange={(e) => setM({ ...m, label: e.target.value })} />
        </Field>
        <Field label="Cosa misura esattamente" hint="Una definizione sola, per non confondere numeri simili.">
          <textarea rows={2} value={m.desc} onChange={(e) => setM({ ...m, desc: e.target.value })} />
        </Field>
        <div className="two">
          <Field label="Unità">
            <select value={m.unit} onChange={(e) => setM({ ...m, unit: e.target.value as Unit })}>
              {UNITS.map((u) => (
                <option key={u.v} value={u.v}>
                  {u.l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Come la registri">
            <select value={m.kind} onChange={(e) => setM({ ...m, kind: e.target.value as 'gauge' | 'counter' })}>
              <option value="gauge">Valore adesso</option>
              <option value="counter">Conteggio che sale</option>
            </select>
          </Field>
        </div>
        <Field label="Percorso a cui appartiene">
          <select value={m.destId ?? ''} onChange={(e) => setM({ ...m, destId: e.target.value || undefined })}>
            <option value="">Nessuno in particolare</option>
            {s.destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="È una parte di un'altra metrica?" hint="Serve a calcolare il tasso (per esempio risposte su contatti).">
          <select value={m.parentId ?? ''} onChange={(e) => setM({ ...m, parentId: e.target.value || undefined })}>
            <option value="">No</option>
            {s.metrics
              .filter((x) => x.id !== m.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
