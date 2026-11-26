import { useState } from 'react';
import { createPairingCode, disconnect, redeemPairingCode, requestSync, revokeOtherDevices, useSyncInfo } from '../store/sync';
import { fmtTime } from '../lib/util';
import { useUI } from './ctx';
import { IconCheck, IconShare } from './icons';
import { Btn, Field, Sec } from './primitives';

const clean = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

/** type the 8-character code, trade it for this device's key */
export function CodeEntry({ onLinked, label = 'Collega' }: { onLinked?: () => void; label?: string }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    if (code.length < 8 || busy) return;
    setBusy(true);
    setErr('');
    try {
      const r = await redeemPairingCode(code);
      if (r === 'invalid') setErr('Codice non valido o scaduto. Ogni codice si usa una volta sola.');
      else onLinked?.();
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setErr(e instanceof TypeError && /fetch|network|load failed|failed to load/i.test(m) ? 'Nessuna connessione: riprova quando sei online.' : `Non riuscito${m ? `: ${m}` : ''}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <Field label="Codice a 8 caratteri">
        <input
          className="code-in"
          value={code}
          onChange={(e) => setCode(clean(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && void go()}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXXXXXX"
          aria-label="Codice di abbinamento"
        />
      </Field>
      {err && <p className="warn-text">{err}</p>}
      <Btn kind="primary" full disabled={code.length < 8 || busy} onClick={() => void go()}>
        {busy ? 'Collego…' : label}
      </Btn>
    </div>
  );
}

export function SyncSection() {
  const ui = useUI();
  const info = useSyncInfo();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const link = code ? `${location.origin}${location.pathname}#c=${code}` : '';

  const newCode = async () => {
    setBusy(true);
    try {
      setCode(await createPairingCode());
    } catch (e) {
      ui.toast(e instanceof Error ? e.message : 'Non riuscito');
    } finally {
      setBusy(false);
    }
  };

  if (!info.connected) {
    return (
      <Sec title="Sincronizzazione">
        <div className="group pad-g">
          <p className="muted">Collega questo dispositivo con un codice: la tua rotta si scarica da sola e resta uguale su iPhone, iPad e Mac.</p>
          <p className="muted">Su iPhone e iPad inserisci il codice dentro l'app installata dalla schermata Home, non in Safari: sono due spazi separati.</p>
          <CodeEntry onLinked={() => ui.toast('Dispositivo collegato')} />
        </div>
      </Sec>
    );
  }

  const s = info.status;
  return (
    <Sec title="Sincronizzazione">
      <div className="group pad-g">
        <div className="kv">
          <span>Stato</span>
          <strong className={s.type === 'failed' ? 'bad' : s.type === 'upToDate' ? 'ok' : ''}>
            {s.type === 'upToDate' ? 'Collegato' : s.type === 'syncing' ? 'Sincronizzo…' : s.type === 'offline' ? 'Offline' : s.type === 'failed' ? 'Problema' : 'Collegato'}
          </strong>
        </div>
        {info.lastSyncedAt && <p className="muted">Ultimo aggiornamento alle {fmtTime(info.lastSyncedAt)}.</p>}
        {s.type === 'failed' && <p className="warn-text">{s.message}</p>}
        {s.type === 'offline' && <p className="muted">Senza rete le modifiche restano su questo dispositivo e partono da sole quando torna.</p>}
        <div className="btn-col">
          <Btn full icon={<IconCheck size={17} />} onClick={() => requestSync(0)}>
            Sincronizza ora
          </Btn>
          <Btn full icon={<IconShare size={17} />} disabled={busy} onClick={() => void newCode()}>
            Nuovo codice per un altro dispositivo
          </Btn>
        </div>
        {code && (
          <div className="code-box">
            <div className="code-big" aria-label="Nuovo codice">
              {code}
            </div>
            <p className="muted">Valido 15 minuti, una volta sola. Inseriscilo sull'altro dispositivo, oppure apri questo link da lì:</p>
            <input className="code-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link di abbinamento" />
          </div>
        )}
        <div className="btn-col">
          <Btn
            kind="ghost"
            full
            onClick={() =>
              ui.modal({
                k: 'confirm',
                title: 'Scollegare gli altri dispositivi?',
                body: 'Tutti gli altri dispositivi smettono di sincronizzare. Questo continua a funzionare. Per ricollegarli serve un nuovo codice.',
                ok: 'Scollega gli altri',
                danger: true,
                onOk: () => void revokeOtherDevices().then((n) => ui.toast(`${n} ${n === 1 ? 'dispositivo scollegato' : 'dispositivi scollegati'}`)).catch((e: Error) => ui.toast(e.message)),
              })
            }
          >
            Scollega gli altri dispositivi
          </Btn>
          <Btn
            kind="ghost"
            full
            onClick={() =>
              ui.modal({
                k: 'confirm',
                title: 'Scollegare questo dispositivo?',
                body: 'I dati restano qui e nel cloud, ma le modifiche non si sincronizzano più finché non inserisci un nuovo codice.',
                ok: 'Scollega',
                danger: true,
                onOk: () => void disconnect().then(() => ui.toast('Dispositivo scollegato')),
              })
            }
          >
            Scollega questo dispositivo
          </Btn>
        </div>
      </div>
    </Sec>
  );
}
