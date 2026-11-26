import { useRef } from 'react';
import { importState, parseImport } from '../store/store';
import { useUI } from './ctx';
import { IconPlus, IconUpload } from './icons';
import { Btn } from './primitives';

/** First launch on a device: nothing is pre-filled. Bring your own route or start a new one. */
export function Welcome() {
  const ui = useUI();
  const file = useRef<HTMLInputElement>(null);

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
        <div className="brand-mark" />
        <div className="brand">MATTANA VITA</div>
        <h1>One destination.
          <br />
          Stay on route.
        </h1>
        <p className="muted">Su questo dispositivo non c'è ancora nessuna rotta. Importa quella che hai già, oppure fissa la tua prima destinazione.</p>
        <div className="btn-col">
          <Btn kind="primary" full icon={<IconUpload size={18} />} onClick={() => file.current?.click()}>
            Importa la mia rotta
          </Btn>
          <Btn full icon={<IconPlus size={18} />} onClick={() => ui.modal({ k: 'edit-dest', destId: null })}>
            Crea la prima destinazione
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
        <p className="muted small-print">I dati restano solo su questo dispositivo: niente account, niente server.</p>
      </div>
    </div>
  );
}
