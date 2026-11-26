# Mattana Vita

Your Life Navigation. One destination. Stay on route.

PWA personale (Vite + React + TypeScript, interfaccia in italiano) per iPhone, iPad e Mac. Funziona offline, i dati restano sul dispositivo
(IndexedDB), nessun account, nessun server, nessuna API a pagamento.

## Idea

- Una destinazione alla volta, un solo percorso attivo. Se un'azione fallisce si ricalcola il percorso, mai la destinazione.
- Un checkpoint è raggiunto solo quando i suoi criteri sono verificati (con una metrica o con un'evidenza scritta). Completare un'azione non basta.
- Nessun progresso inventato: la mappa avanza solo con i criteri verificati; le ETA nascono da misure reali, altrimenti «ETA non ancora determinabile».
- Le strategie correttive (da A a Z) restano nascoste finché non si preme «Ricalcola percorso». Motore a regole deterministiche, nessuna AI.

## Sviluppo

```bash
npm install
npm run dev        # http://localhost:5175
npm run build      # typecheck + build in dist/ (BASE_PATH=/<repo>/ per GitHub Pages)
```

## Deploy

Push su `main`: `.github/workflows/pages.yml` costruisce con `BASE_PATH=/<repo>/` e pubblica su GitHub Pages (Pages → Source = «GitHub Actions»).
Stessa pipeline di Tesoro.

## Installazione

- iPhone / iPad: Safari → Condividi → «Aggiungi alla schermata Home».
- Mac: Safari → File → «Aggiungi al Dock» (o Chrome/Edge → Installa).

## Sincronizzazione con codici (come WEEK)

I dispositivi si collegano con un codice a 8 caratteri monouso (o con il link `…/#c=CODICE`) e restano allineati tramite il progetto Supabase: tabelle `mv_*` (vedi `supabase/migrations`), nessun accesso diretto alle tabelle, solo funzioni che richiedono la chiave del dispositivo. Un dispositivo collegato genera nuovi codici da Impostazioni → Sincronizzazione. Merge per record (vince l'ultima modifica), le misure si uniscono. Su iPhone e iPad il codice va inserito nell'app installata dalla schermata Home, non in Safari (spazi di archiviazione separati).

## Dati

L'app parte vuota su ogni dispositivo: si crea la prima destinazione oppure si importa una rotta da un file JSON (Impostazioni → Importa da un file).

Tutto in IndexedDB (`mattana-vita-state-v1`). Impostazioni → Esporta tutto (JSON) / Importa; backup automatici giornalieri sul dispositivo (ultimi 8).
Il contratto `road.priorities.v1` (Impostazioni → Integrazione con WEEK) espone al progetto WEEK la prossima svolta e la coda delle azioni.

## Mappa

Contorni topografici generati (marching squares), percorso Catmull-Rom, zone di rischio tratteggiate: tutto SVG calcolato nel browser.
Pan, pinch, scroll, doppio tap e tasti `+` `-` `0`. Cerca con ⌘K o `/`.
