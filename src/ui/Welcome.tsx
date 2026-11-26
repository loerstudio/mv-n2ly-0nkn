import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { importState, parseImport } from '../store/store';
import { useSyncInfo } from '../store/sync';
import { useUI } from './ctx';
import { IconNav, IconPlus, IconUpload } from './icons';
import { Btn } from './primitives';
import { CodeEntry } from './SyncUI';

/** First launch on a device: nothing is pre-filled. Connect with a code, bring a file, or start a new route. */
export function Welcome() {
  const ui = useUI();
  const s = useStore();
  const info = useSyncInfo();
  const file = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'menu' | 'code'>('menu');
  const [waiting, setWaiting] = useState(false);

  // a #c=CODE link is being redeemed, or a code was just accepted: wait for the route to arrive
  useEffect(() => {
    if (info.connected && s.destinations.length === 0) setWaiting(true);
  }, [info.connected, s.destinations.length]);

  const onFile = async (f?: File) => {
    if (!f) return;
    const parsed = parseImport(await f.text());
    if (!parsed.ok) {
      ui.toast(parsed.error);
      return;
    }
    await importState(parsed.state);
    ui.toast('Rotta importata');
  };

  return (
    <div className="welcome">
      <div className="welcome-card glass">
        <div className="logo-tile big" aria-hidden="true">
          <IconNav size={30} />
        </div>
        <div className="brand">MATTANA VITA</div>
        <h1>
          One destination.
          <br />
          Stay on route.
        </h1>
        {waiting ? (
          <>
            <p className="muted">{info.status.type === 'failed' ? info.status.message : info.status.type === 'offline' ? 'Nessuna connessione: riprovo appena torna la rete.' : 'Dispositivo collegato. Scarico la tua rotta…'}</p>
            <div className="spinner" aria-hidden="true" />
          </>
        ) : mode === 'code' ? (
          <>
            <p className="muted">Inserisci il codice che ti ho dato: la tua rotta si scarica da sola.</p>
            <CodeEntry onLinked={() => setWaiting(true)} />
            <Btn kind="ghost" onClick={() => setMode('menu')}>
              Indietro
            </Btn>
          </>
        ) : (
          <>
            <p className="muted">Su questo dispositivo non c'è ancora nessuna rotta. Collegalo con un codice, oppure parti da zero.</p>
            <div className="btn-col">
              <Btn kind="primary" full icon={<IconNav size={18} />} onClick={() => setMode('code')}>
                Collega con un codice
              </Btn>
              <Btn full icon={<IconPlus size={18} />} onClick={() => ui.modal({ k: 'edit-dest', destId: null })}>
                Crea la prima destinazione
              </Btn>
              <Btn kind="ghost" full icon={<IconUpload size={17} />} onClick={() => file.current?.click()}>
                Importa da un file
              </Btn>
            </div>
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
          </>
        )}
        <p className="muted small-print">I dati restano sul dispositivo e nel tuo cloud privato: niente account, per collegare un dispositivo serve un tuo codice.</p>
      </div>
    </div>
  );
}
