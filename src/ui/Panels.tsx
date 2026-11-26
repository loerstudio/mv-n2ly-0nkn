import { useEffect, useRef, useState } from 'react';
import { cpEta, cpStatus, cpsOf, cur, destEta, fmtEta, lastReadingT, progress, weekPriorities } from '../lib/engine';
import { askNotifications, notify, notifySupported, saveFile } from '../lib/platform';
import type { Decision, DecisionType, Metric, State } from '../lib/types';
import { ago, dayKey, fmtDate, fmtDay, fmtDur, fmtTime, fmtVal, newId } from '../lib/util';
import { activeDest, exportJson, getMeta, importState, listSnapshots, parseImport, resetAll, restoreSnapshot, setActiveDest, updateSettings, useMeta, type Snapshot } from '../store/store';
import { useUI } from './ctx';
import { IconBell, IconChevron, IconDownload, IconPlus, IconShare, IconTrash, IconUpload } from './icons';
import { Bar, Btn, Field, Row, Sec, Seg, Spark } from './primitives';

// ── destination overview + timeline ────────────────────────────────────────
export function DestView({ s }: { s: State }) {
  const ui = useUI();
  const dest = activeDest(s);
  const list = cpsOf(s, dest.id);
  const doneN = list.filter((c) => c.doneAt).length;
  const eta = destEta(s, dest.id, ui.now);
  return (
    <div className="stack-lg">
      <div className="cp-head">
        <div className="cp-n">{dest.tag}</div>
        <h2>{dest.name}</h2>
        <p className="body">{dest.goal}</p>
        <div className="cp-prog">
          <Bar f={doneN / Math.max(1, list.length)} />
          <span>
            {doneN} di {list.length} checkpoint
          </span>
        </div>
      </div>
      {dest.start && (
        <Sec title="Posizione di partenza">
          <p className="body">{dest.start}</p>
        </Sec>
      )}
      <Sec title="Timeline dinamica">
        <div className="group pad-g">
          <div className="eta-v">{fmtEta(eta)}</div>
          <p className="muted">{eta.basis || 'Nessuna data inventata: la stima nasce solo da risultati registrati.'}</p>
        </div>
      </Sec>
      <Sec title="Checkpoint" aside={<button className="link" onClick={() => ui.modal({ k: 'edit-cp', cpId: null, destId: dest.id })}>Aggiungi</button>}>
        <div className="group">
          {list.map((c, i) => {
            const st = cpStatus(s, c);
            const p = progress(s, c);
            const e = cpEta(s, c, ui.now);
            return (
              <Row key={c.id} onClick={() => ui.openCp(c.id)} chevron>
                <span className={`num-dot ${st}`}>{i + 1}</span>
                <div className="row-b">
                  <div className="row-t">{c.title}</div>
                  <div className="row-s">{st === 'done' ? `Raggiunto il ${fmtDate(c.doneAt!)}` : st === 'locked' ? 'In attesa' : `${p.met} di ${p.total} criteri · ${fmtEta(e)}`}</div>
                </div>
              </Row>
            );
          })}
        </div>
      </Sec>
      <Sec title="Destinazioni">
        <div className="group">
          {s.destinations.map((d) => {
            const l = cpsOf(s, d.id);
            const n = l.filter((c) => c.doneAt).length;
            return (
              <Row
                key={d.id}
                onClick={() => {
                  setActiveDest(d.id);
                  ui.go({ k: 'home' });
                  ui.detent('half');
                }}
                tone={d.id === dest.id ? 'on' : undefined}
                chevron
              >
                <div className="row-b">
                  <div className="row-t">{d.name}</div>
                  <div className="row-s">
                    {n} di {l.length} checkpoint{d.id === dest.id ? ' · rotta attiva' : ''}
                  </div>
                </div>
              </Row>
            );
          })}
        </div>
        <p className="muted pad-s">Una sola rotta alla volta: le altre restano nascoste finché non le scegli.</p>
      </Sec>
      <div className="btn-col">
        <Btn full icon={<IconPlus size={17} />} onClick={() => ui.modal({ k: 'edit-dest', destId: null })}>
          Nuova destinazione
        </Btn>
        <Btn full onClick={() => ui.modal({ k: 'edit-dest', destId: dest.id })}>
          Modifica destinazione
        </Btn>
      </div>
    </div>
  );
}

// ── numbers ────────────────────────────────────────────────────────────────
function MetricCard({ m, s }: { m: Metric; s: State }) {
  const ui = useUI();
  const c = cur(m);
  const lt = lastReadingT(m);
  const parent = m.parentId ? s.metrics.find((x) => x.id === m.parentId) : undefined;
  const pc = parent ? cur(parent) : null;
  return (
    <div className="mcard">
      <div className="mcard-top">
        <div>
          <div className="mcard-l">{m.label}</div>
          <div className="mcard-d">{m.desc}</div>
        </div>
        <div className="mcard-v">{fmtVal(c, m.unit)}</div>
      </div>
      <Spark values={m.log.map((r) => r.v)} />
      <div className="mcard-f">
        <span>
          {lt ? `${m.log.length} ${m.log.length === 1 ? 'misura' : 'misure'} · ${ago(lt, ui.now)}` : 'Nessuna misura registrata'}
          {parent && pc && c != null ? ` · ${Math.round((c / pc) * 100)}% di ${parent.label.toLowerCase()}` : ''}
        </span>
        <span className="btn-inline">
          <button className="link" onClick={() => ui.modal({ k: 'metric', id: m.id })}>
            Modifica
          </button>
          <button className="link strong" onClick={() => ui.modal({ k: 'reading', metricId: m.id })}>
            {m.kind === 'counter' ? '+ Registra' : 'Aggiorna'}
          </button>
        </span>
      </div>
    </div>
  );
}

export function NumbersView({ s }: { s: State }) {
  const ui = useUI();
  const order = [s.activeDestId, ...s.destinations.map((d) => d.id).filter((id) => id !== s.activeDestId)];
  const orphan = s.metrics.filter((m) => !m.destId || !s.destinations.some((d) => d.id === m.destId));
  return (
    <div className="stack-lg">
      <p className="muted">Misure reali, registrate da te. Nessun valore è stimato o inventato dall'app.</p>
      {order.map((id) => {
        const d = s.destinations.find((x) => x.id === id);
        if (!d) return null;
        const ms = s.metrics.filter((m) => m.destId === id);
        if (!ms.length) return null;
        const groups = [...new Set(ms.map((m) => m.group ?? 'Altre'))];
        return (
          <section key={id} className="sec">
            <div className="sec-h">
              <h3>{d.name}</h3>
            </div>
            {groups.map((g) => (
              <div key={g} className="mgroup">
                <div className="lab">{g}</div>
                {g === 'I sei numeri' && <p className="muted">Fatturato, MRR, utile, liquidità, patrimonio e reddito netto sono sei cose diverse: non vanno mai confusi.</p>}
                {ms
                  .filter((m) => (m.group ?? 'Altre') === g)
                  .map((m) => (
                    <MetricCard key={m.id} m={m} s={s} />
                  ))}
              </div>
            ))}
          </section>
        );
      })}
      {orphan.length > 0 && (
        <section className="sec">
          <div className="sec-h">
            <h3>Altre</h3>
          </div>
          {orphan.map((m) => (
            <MetricCard key={m.id} m={m} s={s} />
          ))}
        </section>
      )}
      <Btn full icon={<IconPlus size={17} />} onClick={() => ui.modal({ k: 'metric', id: null })}>
        Nuova metrica
      </Btn>
    </div>
  );
}

// ── history of decisions ───────────────────────────────────────────────────
const FILTERS: { v: string; l: string; types: DecisionType[] | null }[] = [
  { v: 'all', l: 'Tutto', types: null },
  { v: 'route', l: 'Percorso', types: ['start', 'done', 'block', 'unblock', 'result', 'verify', 'checkpoint'] },
  { v: 'fix', l: 'Correzioni', types: ['recalc', 'approve', 'reject'] },
  { v: 'focus', l: 'Focus', types: ['focus'] },
  { v: 'edit', l: 'Modifiche', types: ['edit', 'destination', 'data'] },
];

export function HistoryView({ s }: { s: State }) {
  const ui = useUI();
  const [f, setF] = useState('all');
  const filt = FILTERS.find((x) => x.v === f)!;
  const list = s.decisions.filter((d) => !filt.types || filt.types.includes(d.type));
  const groups: { day: string; t: number; items: Decision[] }[] = [];
  for (const d of list.slice(0, 300)) {
    const k = dayKey(d.t);
    const g = groups[groups.length - 1];
    if (g && g.day === k) g.items.push(d);
    else groups.push({ day: k, t: d.t, items: [d] });
  }
  const done = s.focus.filter((x) => x.t1);
  const mins = Math.round(done.reduce((a, x) => a + (x.t1! - x.t0), 0) / 60000);
  const dist = done.reduce((a, x) => a + x.distractions.length, 0);
  return (
    <div className="stack-lg">
      <div className="stats">
        <div>
          <strong>{done.length}</strong>
          <span>sessioni Focus</span>
        </div>
        <div>
          <strong>{mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60}` : `${mins} min`}</strong>
          <span>in Focus</span>
        </div>
        <div>
          <strong>{dist}</strong>
          <span>distrazioni</span>
        </div>
      </div>
      <Seg value={f} onChange={setF} options={FILTERS.map((x) => ({ v: x.v, l: x.l }))} />
      {groups.length === 0 && <p className="muted">Nessuna decisione registrata in questa vista.</p>}
      {groups.map((g) => (
        <section key={g.day} className="sec">
          <div className="sec-h">
            <h3>{fmtDay(g.t)}</h3>
          </div>
          <div className="group">
            {g.items.map((d) => (
              <Row key={d.id} onClick={d.cpId && s.checkpoints.some((c) => c.id === d.cpId) ? () => ui.openCp(d.cpId!) : undefined} chevron={!!d.cpId}>
                <div className="row-b">
                  <div className="row-t">{d.text}</div>
                  {d.detail && <div className="row-s">{d.detail}</div>}
                  <div className="row-s">{fmtTime(d.t)}</div>
                </div>
              </Row>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── risk zones ─────────────────────────────────────────────────────────────
export function ZonesView({ s }: { s: State }) {
  const ui = useUI();
  return (
    <div className="stack-lg">
      <p className="muted">Zone tratteggiate attorno alla rotta: comportamenti e scenari personali che voglio evitare. Non sono un giudizio sulle scelte di vita degli altri.</p>
      <div className="group">
        {s.zones.map((z) => {
          const hits = s.focus.reduce((n, f) => n + f.distractions.filter((d) => d.zoneId === z.id).length, 0);
          return (
            <Row key={z.id} onClick={() => ui.modal({ k: 'zone', id: z.id })} chevron>
              <span className="zone-dot" />
              <div className="row-b">
                <div className="row-t">{z.name}</div>
                <div className="row-s">{hits > 0 ? `Segnata ${hits} ${hits === 1 ? 'volta' : 'volte'} in Focus` : z.signal}</div>
              </div>
            </Row>
          );
        })}
      </div>
      <Btn full icon={<IconPlus size={17} />} onClick={() => ui.modal({ k: 'zone', id: null })}>
        Aggiungi una zona
      </Btn>
    </div>
  );
}

// ── settings, backup, notifications, WEEK ──────────────────────────────────
export function SettingsView({ s }: { s: State }) {
  const ui = useUI();
  const meta = useMeta();
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [perm, setPerm] = useState<string>(notifySupported() ? Notification.permission : 'unsupported');
  const [rText, setRText] = useState('');
  const [rKind, setRKind] = useState<'focus' | 'daily'>('focus');
  const [rEvery, setREvery] = useState('20');
  const [rAt, setRAt] = useState('09:00');
  const file = useRef<HTMLInputElement>(null);
  const week = weekPriorities(s);

  useEffect(() => {
    void listSnapshots().then(setSnaps);
  }, [meta.savedAt]);

  const doExport = async () => {
    const day = new Date().toISOString().slice(0, 10);
    const r = await saveFile(`mattana-vita-${day}.json`, exportJson());
    if (r !== 'cancel') {
      updateSettings({ lastExportAt: Date.now() });
      ui.toast(r === 'shared' ? 'Backup condiviso' : 'Backup scaricato');
    }
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    const parsed = parseImport(await f.text());
    if (!parsed.ok) {
      ui.toast(parsed.error);
      return;
    }
    ui.modal({
      k: 'confirm',
      title: 'Importare questi dati?',
      body: `Il file contiene ${parsed.summary}. Sostituiranno quelli attuali; prima viene salvato un backup automatico di quelli di adesso.`,
      ok: 'Importa',
      danger: true,
      onOk: () => {
        void importState(parsed.state).then(() => ui.toast('Dati importati'));
      },
    });
  };

  const enableNotifs = async () => {
    const p = await askNotifications();
    setPerm(p);
    if (p === 'granted') {
      updateSettings({ notify: true });
      await notify('Mattana Vita', 'Le notifiche locali sono attive.');
    } else ui.toast(p === 'unsupported' ? 'Questo dispositivo non supporta le notifiche' : 'Permesso non concesso');
  };

  const copyWeek = async () => {
    const text = JSON.stringify(week, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      ui.toast('Priorità copiate');
    } catch {
      const r = await saveFile('road-priorities.json', text);
      if (r !== 'cancel') ui.toast('Priorità salvate');
    }
  };

  const addReminder = () => {
    if (!rText.trim()) return;
    const every = parseInt(rEvery, 10);
    updateSettings({
      reminders: [
        ...s.settings.reminders,
        { id: newId('r'), text: rText.trim(), on: true, ...(rKind === 'focus' ? { everyMin: Number.isFinite(every) && every > 0 ? every : 20 } : { at: rAt }) },
      ],
    });
    setRText('');
  };

  const daysSince = s.settings.lastExportAt ? Math.floor((ui.now - s.settings.lastExportAt) / 86400000) : null;

  return (
    <div className="stack-lg">
      <Sec title="Salvataggio">
        <div className="group pad-g">
          <div className="kv">
            <span>Stato</span>
            <strong className={meta.persistOk ? 'ok' : 'bad'}>{meta.persistOk ? 'Salvato su questo dispositivo' : 'Salvataggio non disponibile'}</strong>
          </div>
          {meta.savedAt && <p className="muted">Ultimo salvataggio automatico alle {fmtTime(meta.savedAt)}.</p>}
          <p className="muted">I dati vivono solo su questo dispositivo, senza account né server. Per usarli anche su un altro dispositivo o per sicurezza, esporta un backup.</p>
        </div>
      </Sec>

      <Sec title="Backup e ripristino">
        <div className="group pad-g">
          {daysSince == null ? <p className="warn-text">Non hai ancora esportato nessun backup.</p> : <p className="muted">Ultimo backup esportato: {daysSince === 0 ? 'oggi' : `${daysSince} giorni fa`}.</p>}
          <div className="btn-col">
            <Btn full kind="primary" icon={<IconDownload size={17} />} onClick={doExport}>
              Esporta tutto (JSON)
            </Btn>
            <Btn full icon={<IconUpload size={17} />} onClick={() => file.current?.click()}>
              Importa da un file
            </Btn>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          {snaps.length > 0 && (
            <>
              <div className="lab">Backup automatici su questo dispositivo</div>
              {snaps.map((sn) => (
                <div className="snap" key={sn.t}>
                  <div>
                    <strong>{new Date(sn.t).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong>
                    <span>{sn.label}</span>
                  </div>
                  <button
                    className="link"
                    onClick={() =>
                      ui.modal({
                        k: 'confirm',
                        title: 'Ripristinare questo backup?',
                        body: 'I dati attuali vengono sostituiti. Prima viene salvato un backup di quelli di adesso.',
                        ok: 'Ripristina',
                        danger: true,
                        onOk: () => void restoreSnapshot(sn.t).then(() => ui.toast('Backup ripristinato')),
                      })
                    }
                  >
                    Ripristina
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </Sec>

      <Sec title="Notifiche e promemoria">
        <div className="group pad-g">
          <p className="muted">Le notifiche sono locali: partono mentre l'app è aperta o in secondo piano. Su iPhone e iPad funzionano dopo «Aggiungi alla schermata Home».</p>
          {perm === 'unsupported' ? (
            <p className="warn-text">Questo browser non supporta le notifiche.</p>
          ) : perm === 'denied' ? (
            <p className="warn-text">Le notifiche sono bloccate nelle impostazioni del dispositivo.</p>
          ) : (
            <Btn full icon={<IconBell size={17} />} onClick={enableNotifs}>
              {perm === 'granted' ? 'Invia una notifica di prova' : 'Attiva le notifiche'}
            </Btn>
          )}
          <div className="lab">I tuoi promemoria</div>
          {s.settings.reminders.length === 0 && <p className="muted">Nessun promemoria. Aggiungine uno sotto.</p>}
          {s.settings.reminders.map((r) => (
            <div className="snap" key={r.id}>
              <div>
                <strong>{r.text}</strong>
                <span>{r.everyMin ? `Ogni ${r.everyMin} min durante il Focus` : `Ogni giorno alle ${r.at}`}</span>
              </div>
              <span className="btn-inline">
                <button className="link" onClick={() => updateSettings({ reminders: s.settings.reminders.map((x) => (x.id === r.id ? { ...x, on: !x.on } : x)) })}>
                  {r.on ? 'Attivo' : 'Spento'}
                </button>
                <button className="icon-btn" aria-label="Elimina promemoria" onClick={() => updateSettings({ reminders: s.settings.reminders.filter((x) => x.id !== r.id) })}>
                  <IconTrash size={15} />
                </button>
              </span>
            </div>
          ))}
          <Field label="Nuovo promemoria">
            <input value={rText} onChange={(e) => setRText(e.target.value)} placeholder="Per esempio: respira e torna alla prossima svolta" />
          </Field>
          <Seg
            value={rKind}
            onChange={setRKind}
            options={[
              { v: 'focus', l: 'Durante il Focus' },
              { v: 'daily', l: 'Ogni giorno' },
            ]}
          />
          {rKind === 'focus' ? (
            <Field label="Ogni quanti minuti">
              <input inputMode="numeric" value={rEvery} onChange={(e) => setREvery(e.target.value)} />
            </Field>
          ) : (
            <Field label="A che ora">
              <input type="time" value={rAt} onChange={(e) => setRAt(e.target.value)} />
            </Field>
          )}
          <Btn full icon={<IconPlus size={16} />} disabled={!rText.trim()} onClick={addReminder}>
            Aggiungi promemoria
          </Btn>
          <Field label="Durata predefinita del Focus (minuti)">
            <input inputMode="numeric" value={String(s.settings.focusMin)} onChange={(e) => updateSettings({ focusMin: Math.max(1, parseInt(e.target.value, 10) || 25) })} />
          </Field>
        </div>
      </Sec>

      <Sec title="Integrazione con WEEK">
        <div className="group pad-g">
          <p className="muted">Mattana Vita determina le priorità, WEEK organizza il tempo. Questo è il contratto che WEEK potrà leggere: solo la prossima svolta e la coda delle azioni del checkpoint attivo.</p>
          <pre className="code">{JSON.stringify(week, null, 2)}</pre>
          <Btn full icon={<IconShare size={17} />} onClick={copyWeek}>
            Copia le priorità
          </Btn>
        </div>
      </Sec>

      <Sec title="Informazioni">
        <div className="group pad-g">
          <p className="muted">
            One destination. Stay on route. La destinazione non cambia; se un'azione fallisce si ricalcola il percorso. Nessun progresso inventato: tutto ciò che vedi viene da te.
          </p>
          <Btn
            kind="danger"
            full
            onClick={() =>
              ui.modal({
                k: 'confirm',
                title: 'Azzerare tutto?',
                body: 'Torni alla configurazione iniziale: le misure e lo storico attuali vengono cancellati. Prima viene salvato un backup automatico.',
                ok: 'Azzera',
                danger: true,
                onOk: () => void resetAll().then(() => ui.toast('Dati azzerati')),
              })
            }
          >
            Azzera tutti i dati
          </Btn>
        </div>
      </Sec>
    </div>
  );
}

export { IconChevron, fmtDur, getMeta };
