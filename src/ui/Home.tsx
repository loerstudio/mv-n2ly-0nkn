import { useState } from 'react';
import { contactsForNext, cpById, cpEta, cpStatus, cpsOf, critMet, conv, cur, currentCp, destById, fmtEta, lastReadingT, lockReasons, metricById, nextAction, openActions, progress, targetCurrent, targetGoal, whereText } from '../lib/engine';
import type { Action, Checkpoint, State } from '../lib/types';
import { ago, fmtDate, fmtDur, fmtVal } from '../lib/util';
import { activeDest, addAction, blockAction, completeAction, moveAction, reopenCheckpoint, setActiveDest, startAction, unblockAction, unverifyCriterion } from '../store/store';
import { useUI } from './ctx';
import { IconBlock, IconCheck, IconChevron, IconFocus, IconLock, IconPlay, IconPlus, IconRecalc, IconResult, IconTurn, IconDown, IconUp } from './icons';
import { Bar, Btn, Collapsible, Row, Sec } from './primitives';

// ── HOME: where am I, where am I going, next checkpoint, what now ──────────
export function Home({ s }: { s: State }) {
  const ui = useUI();
  const dest = activeDest(s);
  const cp = currentCp(s, dest.id);
  const [just, setJust] = useState<string | null>(null);

  if (!cp && cpsOf(s, dest.id).length === 0) {
    return (
      <div className="home">
        <div className="turn waiting">
          <div className="turn-tag">
            <IconTurn size={16} /> NESSUN CHECKPOINT
          </div>
          <p className="turn-text">{dest.name} non ha ancora un percorso.</p>
          <p className="muted">Aggiungi il primo checkpoint: un risultato esatto, come lo verifichi e la prima azione.</p>
          <Btn kind="primary" full icon={<IconPlus size={18} />} onClick={() => ui.modal({ k: 'edit-cp', cpId: null, destId: dest.id })}>
            Aggiungi un checkpoint
          </Btn>
        </div>
      </div>
    );
  }

  if (!cp) {
    return (
      <div className="home">
        <div className="turn reached">
          <div className="turn-tag">
            <IconCheck size={15} /> DESTINAZIONE RAGGIUNTA
          </div>
          <p className="turn-text">{dest.name}: {dest.goal}</p>
          <p className="muted">Tutti i checkpoint sono raggiunti. Scegli la prossima destinazione o rivedi il percorso fatto.</p>
          <div className="btn-row">
            <Btn kind="primary" full onClick={() => ui.modal({ k: 'edit-dest', destId: null })} icon={<IconPlus size={18} />}>
              Nuova destinazione
            </Btn>
            <Btn full onClick={() => ui.go({ k: 'dest' })}>
              Rivedi il percorso
            </Btn>
          </div>
        </div>
      </div>
    );
  }

  const status = cpStatus(s, cp);
  const act = nextAction(cp);
  const p = progress(s, cp);
  const idx = cpsOf(s, dest.id).findIndex((c) => c.id === cp.id);

  const rows = (
    <div className="ctx-rows">
      <Row onClick={() => ui.go({ k: 'dest' })} chevron>
        <div>
          <div className="lab">Dove sei</div>
          <div className="val">{whereText(s, dest)}</div>
          <Bar f={cpsOf(s, dest.id).filter((c) => c.doneAt).length / Math.max(1, cpsOf(s, dest.id).length) + p.f / Math.max(1, cpsOf(s, dest.id).length)} />
        </div>
      </Row>
      <Row onClick={() => ui.go({ k: 'dest' })} chevron>
        <div>
          <div className="lab">Dove stai andando</div>
          <div className="val">
            {dest.name} <span className="soft">— {dest.goal}</span>
          </div>
        </div>
      </Row>
      <Row onClick={() => ui.openCp(cp.id)} chevron>
        <div>
          <div className="lab">Prossimo checkpoint</div>
          <div className="val">
            {idx + 1}. {cp.title}
          </div>
        </div>
      </Row>
    </div>
  );

  if (status === 'locked') {
    const reasons = lockReasons(s, cp);
    const blocker = cp.deps.map((id) => cpById(s, id)).find((c) => c && !c.doneAt);
    return (
      <div className="home">
        <div className="turn waiting">
          <div className="turn-tag">
            <IconLock size={15} /> IN ATTESA
          </div>
          <p className="turn-text">{cp.title}</p>
          <ul className="plain">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="muted">Questo percorso riparte quando il checkpoint che lo precede è raggiunto. Nessuna azione da fare qui, per ora.</p>
          {blocker && (
            <Btn
              kind="primary"
              full
              onClick={() => {
                setActiveDest(blocker.destId);
                ui.openCp(blocker.id);
              }}
            >
              Vai a: {blocker.title}
            </Btn>
          )}
        </div>
        {rows}
      </div>
    );
  }

  const doing = act?.status === 'doing';
  const blocked = act?.status === 'blocked';

  return (
    <div className="home">
      {p.complete && p.total > 0 && (
        <div className="banner ok">
          <div>
            <strong>Tutti i criteri sono verificati.</strong>
            <span> Conferma che il checkpoint è raggiunto.</span>
          </div>
          <Btn kind="primary" small onClick={() => ui.modal({ k: 'done', cpId: cp.id })}>
            Conferma
          </Btn>
        </div>
      )}
      {just && (
        <div className="banner">
          <div>
            <strong>Azione completata.</strong>
            <span> Ha prodotto un risultato misurabile?</span>
          </div>
          <div className="btn-inline">
            <Btn
              kind="tint"
              small
              onClick={() => {
                setJust(null);
                ui.modal({ k: 'result', cpId: cp.id });
              }}
            >
              Registra
            </Btn>
            <Btn kind="ghost" small onClick={() => setJust(null)}>
              Più tardi
            </Btn>
          </div>
        </div>
      )}

      <div className={`turn${blocked ? ' blocked' : ''}`}>
        <div className="turn-tag">
          <IconTurn size={16} /> PROSSIMA SVOLTA
        </div>
        {act ? (
          <>
            <p className="turn-text">{act.text}</p>
            <p className="turn-meta">
              {doing && act.startedAt ? `In corso da ${fmtDur(ui.now - act.startedAt)} · ` : ''}
              {blocked ? `Bloccata: ${act.blockedReason ?? 'senza motivo'} · ` : ''}
              {cp.title}
            </p>
            {blocked ? (
              <div className="btn-grid">
                <Btn kind="primary" full icon={<IconRecalc size={18} />} onClick={() => ui.modal({ k: 'recalc', cpId: cp.id, actionId: act.id })}>
                  Ricalcola percorso
                </Btn>
                <Btn full onClick={() => unblockAction(cp.id, act.id)}>
                  Sblocca
                </Btn>
              </div>
            ) : (
              <>
                <div className="btn-grid">
                  {doing ? (
                    <>
                      <Btn
                        kind="primary"
                        full
                        icon={<IconCheck size={18} />}
                        onClick={() => {
                          completeAction(cp.id, act.id);
                          setJust(act.id);
                        }}
                      >
                        Completato
                      </Btn>
                      <Btn full icon={<IconFocus size={18} />} onClick={ui.focus}>
                        Focus
                      </Btn>
                    </>
                  ) : (
                    <>
                      <Btn kind="primary" full icon={<IconPlay size={16} />} onClick={() => startAction(cp.id, act.id)}>
                        Inizia
                      </Btn>
                      <Btn
                        full
                        icon={<IconCheck size={18} />}
                        onClick={() => {
                          completeAction(cp.id, act.id);
                          setJust(act.id);
                        }}
                      >
                        Completato
                      </Btn>
                    </>
                  )}
                </div>
                <div className="btn-grid">
                  <Btn full icon={<IconBlock size={17} />} onClick={() => ui.modal({ k: 'block', cpId: cp.id, actionId: act.id })}>
                    Bloccato
                  </Btn>
                  <Btn full icon={<IconResult size={17} />} onClick={() => ui.modal({ k: 'result', cpId: cp.id })}>
                    Registra risultato
                  </Btn>
                </div>
                <Btn kind="ghost" full icon={<IconRecalc size={17} />} onClick={() => ui.modal({ k: 'recalc', cpId: cp.id, actionId: act.id })}>
                  Ricalcola percorso
                </Btn>
              </>
            )}
          </>
        ) : (
          <>
            <p className="turn-text">Nessuna azione aperta.</p>
            <p className="turn-meta">Il checkpoint non è raggiunto finché i criteri non sono verificati: {p.met} di {p.total}.</p>
            <div className="btn-grid">
              <Btn kind="primary" full icon={<IconPlus size={18} />} onClick={() => ui.modal({ k: 'edit-cp', cpId: cp.id })}>
                Aggiungi azione
              </Btn>
              <Btn full icon={<IconResult size={17} />} onClick={() => ui.modal({ k: 'result', cpId: cp.id })}>
                Registra risultato
              </Btn>
            </div>
            <Btn kind="ghost" full icon={<IconRecalc size={17} />} onClick={() => ui.modal({ k: 'recalc', cpId: cp.id })}>
              Ricalcola percorso
            </Btn>
          </>
        )}
      </div>
      {rows}
    </div>
  );
}

// ── CHECKPOINT DETAIL ──────────────────────────────────────────────────────
export function CheckpointView({ s, id }: { s: State; id: string }) {
  const ui = useUI();
  const cp = cpById(s, id);
  const [openA, setOpenA] = useState<string | null>(null);
  const [newA, setNewA] = useState('');
  if (!cp) return <p className="muted pad">Questo checkpoint non esiste più.</p>;
  const dest = destById(s, cp.destId)!;
  const list = cpsOf(s, cp.destId);
  const idx = list.findIndex((c) => c.id === cp.id);
  const st = cpStatus(s, cp);
  const p = progress(s, cp);
  const eta = cpEta(s, cp, ui.now);
  const reasons = lockReasons(s, cp);

  const metricIds: string[] = [];
  for (const c of cp.criteria) if (c.target && !metricIds.includes(c.target.metricId)) metricIds.push(c.target.metricId);
  for (const t of cp.targets) if (!metricIds.includes(t.metricId)) metricIds.push(t.metricId);

  const nextId = nextAction(cp)?.id;
  const history = cp.strategies.filter((x) => x.status !== 'ready');
  const ready = cp.strategies.length - history.length;

  return (
    <div className="cpv">
      <div className="cp-head">
        <div className="cp-n">
          {dest.name} · Checkpoint {idx + 1} di {list.length}
        </div>
        <h2>{cp.title}</h2>
        <div className={`chip ${st}`}>{st === 'done' ? 'Raggiunto' : st === 'active' ? 'Attivo' : 'In attesa'}</div>
        <div className="cp-prog">
          <Bar f={p.f} tone={st === 'done' ? 'green' : 'blue'} />
          <span>
            {p.met} di {p.total} criteri
          </span>
        </div>
        {st === 'locked' && (
          <ul className="plain warn">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      <Sec title="Risultato esatto">
        <p className="body">{cp.result}</p>
      </Sec>
      <Sec title="Perché è necessario">
        <p className="body">{cp.why}</p>
      </Sec>

      <Sec title="Criteri di completamento" aside={st !== 'done' && st === 'active' ? <button className="link" onClick={() => ui.modal({ k: 'result', cpId: cp.id })}>Registra risultato</button> : undefined}>
        <div className="group">
          {cp.criteria.map((c) => {
            const met = critMet(s, c);
            const m = c.target ? metricById(s, c.target.metricId) : undefined;
            const t = c.target;
            const val = t ? targetCurrent(s, t) : null;
            const goal = t ? targetGoal(s, t) : NaN;
            return (
              <div className="crit" key={c.id}>
                <button
                  type="button"
                  className={`tick${met ? ' on' : ''}`}
                  aria-label={met ? 'Verificato' : 'Da verificare'}
                  disabled={!!t || st === 'locked'}
                  onClick={() => (c.done ? unverifyCriterion(cp.id, c.id) : ui.modal({ k: 'verify', cpId: cp.id, critId: c.id }))}
                >
                  {met && <IconCheck size={14} />}
                </button>
                <div className="crit-b">
                  <div className="crit-t">{c.text}</div>
                  {t && m && (
                    <div className="crit-m">
                      {t.dir === 'any' ? (met ? 'Misura registrata' : 'Nessuna misura ancora') : `${t.rate ? 'Tasso' : m.label}: ${val == null ? '—' : t.rate ? `${Math.round(val)}%` : fmtVal(val, m.unit)} · obiettivo ${t.dir === 'lte' ? '≤' : '≥'} ${Number.isNaN(goal) ? 'da definire' : t.rate ? `${goal}%` : fmtVal(goal, m.unit)}`}
                    </div>
                  )}
                  {!t && c.done && (
                    <div className="crit-m">
                      Evidenza: {c.evidence} · {c.doneAt ? fmtDate(c.doneAt) : ''}
                    </div>
                  )}
                </div>
                {t && st !== 'done' && (
                  <button type="button" className="link" onClick={() => ui.modal({ k: 'reading', metricId: t.metricId })}>
                    Misura
                  </button>
                )}
              </div>
            );
          })}
          {cp.criteria.length === 0 && <p className="muted pad-s">Nessun criterio definito: aggiungine uno in «Modifica checkpoint».</p>}
        </div>
      </Sec>

      <Sec title="Azioni, per priorità">
        <div className="group">
          {cp.actions.map((a, i) => (
            <ActionRow key={a.id} cp={cp} a={a} i={i} next={a.id === nextId} open={openA === a.id} toggle={() => setOpenA(openA === a.id ? null : a.id)} />
          ))}
          <form
            className="add-inline"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newA.trim()) return;
              addAction(cp.id, newA);
              setNewA('');
            }}
          >
            <input value={newA} onChange={(e) => setNewA(e.target.value)} placeholder="Aggiungi un'azione specifica" aria-label="Nuova azione" />
            <button type="submit" className="icon-btn" aria-label="Aggiungi">
              <IconPlus size={18} />
            </button>
          </form>
        </div>
      </Sec>

      {metricIds.length > 0 && (
        <Sec title="Metriche verificabili">
          <div className="group">
            {metricIds.map((mid) => {
              const m = metricById(s, mid);
              if (!m) return null;
              const c = cur(m);
              const cv = conv(s, m);
              const parent = m.parentId ? metricById(s, m.parentId) : undefined;
              const lt = lastReadingT(m);
              return (
                <div className="metric-row" key={mid}>
                  <div>
                    <div className="mr-l">{m.label}</div>
                    <div className="mr-s">
                      {lt ? `aggiornata ${ago(lt, ui.now)}` : 'nessuna misura'}
                      {parent && cv != null ? ` · ${Math.round(cv * 100)}% di ${parent.label.toLowerCase()}` : ''}
                    </div>
                  </div>
                  <div className="mr-v">{fmtVal(c, m.unit)}</div>
                  <button className="link" onClick={() => ui.modal({ k: 'reading', metricId: mid })}>
                    {m.kind === 'counter' ? '+ Registra' : 'Aggiorna'}
                  </button>
                </div>
              );
            })}
            {metricIds.includes('m_contatti') && contactsForNext(s) != null && <p className="insight">Al tuo tasso reale servono circa {contactsForNext(s)} contatti per ogni nuovo cliente pagante.</p>}
          </div>
        </Sec>
      )}

      <Sec title="Stima dei tempi">
        <div className="group pad-g">
          <div className="eta-v">{fmtEta(eta)}</div>
          {eta.basis && <p className="muted">{eta.basis}</p>}
        </div>
      </Sec>

      <Collapsible title="Prerequisiti e dipendenze" count={cp.prereqs.length + cp.deps.length}>
        <ul className="plain">
          {cp.prereqs.map((x) => (
            <li key={x}>{x}</li>
          ))}
          {cp.deps.map((d) => {
            const c = cpById(s, d);
            return c ? (
              <li key={d}>
                {c.doneAt ? '✓ ' : ''}Dipende da: {c.title} ({destById(s, c.destId)?.name})
              </li>
            ) : null;
          })}
          {idx > 0 && <li>{list[idx - 1].doneAt ? '✓ ' : ''}Checkpoint precedente: {list[idx - 1].title}</li>}
        </ul>
      </Collapsible>
      <Collapsible title="Risorse necessarie" count={cp.resources.length}>
        <ul className="plain">
          {cp.resources.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </Collapsible>
      <Collapsible title="Ostacoli prevedibili" count={cp.obstacles.length}>
        <ul className="plain">
          {cp.obstacles.map((o) => (
            <li key={o.id}>{o.text}</li>
          ))}
        </ul>
      </Collapsible>

      <Sec title="Strategie correttive">
        <div className="group pad-g">
          <p className="muted">
            {ready} {ready === 1 ? 'strategia pronta' : 'strategie pronte'}, nascoste finché un'azione non fallisce. Compaiono solo quando premi «Ricalcola percorso».
          </p>
          {history.map((x) => (
            <div key={x.id} className="hist-strat">
              <strong>{String.fromCharCode(65 + cp.strategies.indexOf(x))} — {x.title}</strong>
              <span className={`chip ${x.status}`}>{x.status === 'applied' ? 'In corso' : x.status === 'ineffective' ? 'Inefficace' : x.status === 'worked' ? 'Ha funzionato' : 'Rifiutata'}</span>
            </div>
          ))}
        </div>
      </Sec>

      <div className="btn-col">
        {st === 'active' && p.total === 0 && !cp.doneAt && <p className="muted">Questo checkpoint non ha criteri: aggiungine almeno uno in «Modifica checkpoint» per poterlo dichiarare raggiunto.</p>}
        {st === 'active' && p.complete && p.total > 0 && !cp.doneAt && (
          <Btn kind="primary" full icon={<IconCheck size={18} />} onClick={() => ui.modal({ k: 'done', cpId: cp.id })}>
            Checkpoint raggiunto
          </Btn>
        )}
        {cp.doneAt && (
          <div className="group pad-g">
            <div className="muted">Raggiunto il {fmtDate(cp.doneAt)}{cp.doneNote ? ` — ${cp.doneNote}` : ''}</div>
            <Btn kind="ghost" onClick={() => reopenCheckpoint(cp.id)}>
              Riapri il checkpoint
            </Btn>
          </div>
        )}
        <Btn full onClick={() => ui.modal({ k: 'edit-cp', cpId: cp.id })}>
          Modifica checkpoint
        </Btn>
      </div>
    </div>
  );
}

function ActionRow({ cp, a, i, next, open, toggle }: { cp: Checkpoint; a: Action; i: number; next: boolean; open: boolean; toggle: () => void }) {
  const ui = useUI();
  const icon = a.status === 'done' ? <IconCheck size={13} /> : a.status === 'doing' ? <IconPlay size={11} /> : a.status === 'blocked' ? <IconBlock size={13} /> : a.status === 'failed' ? <span>×</span> : null;
  const isOpen = a.status === 'todo' || a.status === 'doing' || a.status === 'blocked';
  return (
    <div className={`act ${a.status}${next ? ' next' : ''}`}>
      <button type="button" className="act-h" onClick={toggle} aria-expanded={open}>
        <span className={`dot ${a.status}`}>{icon}</span>
        <span className="act-t">
          <span className="act-n">{i + 1}</span> {a.text}
          {a.fromStrategy && <em className="fix"> correzione</em>}
        </span>
        <IconChevron size={14} />
      </button>
      {open && (
        <div className="act-b">
          {a.blockedReason && <p className="muted">Bloccata: {a.blockedReason}</p>}
          {a.failNote && <p className="muted">Non ha funzionato: {a.failNote}</p>}
          {isOpen && (
            <div className="btn-inline wrap">
              {a.status !== 'doing' && a.status !== 'blocked' && (
                <Btn small kind="tint" onClick={() => startAction(cp.id, a.id)}>
                  Inizia
                </Btn>
              )}
              <Btn small kind="tint" onClick={() => completeAction(cp.id, a.id)}>
                Completato
              </Btn>
              {a.status === 'blocked' ? (
                <Btn small onClick={() => unblockAction(cp.id, a.id)}>
                  Sblocca
                </Btn>
              ) : (
                <Btn small onClick={() => ui.modal({ k: 'block', cpId: cp.id, actionId: a.id })}>
                  Bloccato
                </Btn>
              )}
              <Btn small onClick={() => moveAction(cp.id, a.id, -1)} icon={<IconUp size={14} />} title="Sposta su" />
              <Btn small onClick={() => moveAction(cp.id, a.id, 1)} icon={<IconDown size={14} />} title="Sposta giù" />
            </div>
          )}
          {a.doneAt && a.status === 'done' && <p className="muted">Completata il {fmtDate(a.doneAt)}</p>}
        </div>
      )}
    </div>
  );
}

export { openActions };
