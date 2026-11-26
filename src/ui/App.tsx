import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cpById, cpsOf, currentCp, nextAction } from '../lib/engine';
import { notify } from '../lib/platform';
import { dayKey } from '../lib/util';
import { activeDest, getState, setActiveDest, useMeta, useStore } from '../store/store';
import { Detent, ModalSpec, UICtx, View, type UI } from './ctx';
import { EditCheckpointModal, EditDestModal, MetricModal, ZoneModal } from './Editors';
import { BlockModal, ConfirmModal, DoneModal, ReadingModal, RecalcModal, ResultModal, VerifyModal } from './Flows';
import { Focus } from './Focus';
import { CheckpointView, Home } from './Home';
import { MapView, type MapHandle } from './MapView';
import { DestView, HistoryView, NumbersView, SettingsView, ZonesView } from './Panels';
import { Search } from './Search';
import { Welcome } from './Welcome';
import { IconBack, IconChevron, IconFocus, IconGauge, IconGear, IconHistory, IconLayers, IconLocate, IconMinus, IconMore, IconPlus, IconSearch, IconZone } from './icons';

function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

const TITLES: Record<string, string> = { cp: 'Checkpoint', dest: 'Destinazione', numbers: 'Numeri', history: 'Storico', zones: 'Zone di rischio', settings: 'Impostazioni' };

function InstallTip() {
  const [hide, setHide] = useState(() => localStorage.getItem('mv-tip') === '1');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (hide || standalone || !ios) return null;
  return (
    <div className="banner">
      <div>
        <strong>Installa l'app.</strong>
        <span> In Safari tocca Condividi, poi «Aggiungi alla schermata Home»: si apre a schermo intero e funziona offline.</span>
      </div>
      <button
        className="link"
        onClick={() => {
          localStorage.setItem('mv-tip', '1');
          setHide(true);
        }}
      >
        Ok
      </button>
    </div>
  );
}

export function App() {
  const s = useStore();
  const meta = useMeta();
  const wide = useMedia('(min-width: 700px)');
  const [vh, setVh] = useState(window.innerHeight);
  const [stack, setStack] = useState<View[]>([{ k: 'home' }]);
  const [detent, setDetentState] = useState<Detent>('half');
  const [modal, setModal] = useState<ModalSpec | null>(null);
  const [focus, setFocus] = useState(false);
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const map = useRef<MapHandle>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; h0: number; t0: number; moved: boolean } | null>(null);

  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20_000);
    const vis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  // daily reminders, while the app is open
  useEffect(() => {
    const key = 'mv-reminders-fired';
    const id = setInterval(() => {
      const st = getState();
      const d = new Date();
      const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      let fired: Record<string, string> = {};
      try {
        fired = JSON.parse(localStorage.getItem(key) ?? '{}');
      } catch {
        fired = {};
      }
      for (const r of st.settings.reminders) {
        if (!r.on || !r.at || r.at !== hhmm || fired[r.id] === dayKey(Date.now())) continue;
        fired[r.id] = dayKey(Date.now());
        localStorage.setItem(key, JSON.stringify(fired));
        setToast({ id: Date.now(), msg: r.text });
        void notify('Promemoria', r.text);
      }
    }, 20_000);
    return () => clearInterval(id);
  }, []);

  const HEIGHT: Record<Detent, number> = useMemo(() => ({ peek: 266, half: Math.max(360, Math.round(vh * 0.56)), full: vh - 64 }), [vh]);

  const showToast = useCallback((msg: string) => {
    const id = Date.now();
    setToast({ id, msg });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 2800);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const t = setTimeout(() => setToast((x) => (x && x.id === id ? null : x)), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const setDetent = useCallback((d: Detent) => setDetentState(d), []);

  const openCp = useCallback((id: string) => {
    const cp = cpById(getState(), id);
    if (!cp) return;
    if (cp.destId !== getState().activeDestId) setActiveDest(cp.destId);
    setStack([{ k: 'home' }, { k: 'cp', id }]);
    setDetentState((d) => (d === 'peek' ? 'half' : d));
    setTimeout(() => {
      const list = cpsOf(getState(), cp.destId);
      map.current?.focusStop(list.findIndex((c) => c.id === id) + 1);
    }, 80);
  }, []);

  const go = useCallback((v: View) => {
    if (v.k === 'home') {
      setStack([{ k: 'home' }]);
      return;
    }
    if (v.k === 'cp') {
      openCp(v.id);
      return;
    }
    setStack((st) => (st[st.length - 1].k === v.k ? [...st.slice(0, -1), v] : [...st, v]));
    setDetentState('full');
  }, [openCp]);

  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);

  const ui: UI = useMemo(
    () => ({ go, back, modal: setModal, toast: showToast, focus: () => setFocus(true), openCp, detent: setDetent, wide, now }),
    [go, back, showToast, openCp, setDetent, wide, now],
  );

  // keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearching(true);
        return;
      }
      if (typing || modal || focus || searching) return;
      if (e.key === '/') {
        e.preventDefault();
        setSearching(true);
      } else if (e.key === '+' || e.key === '=') map.current?.zoomBy(1.35);
      else if (e.key === '-') map.current?.zoomBy(1 / 1.35);
      else if (e.key === '0') map.current?.recenter(true);
      else if (e.key === 'Escape') {
        setMenu(false);
        if (stack.length > 1) back();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [modal, focus, searching, stack.length, back]);

  // sheet dragging (phones)
  const onGrabDown = (e: React.PointerEvent) => {
    if (wide || (e.target as HTMLElement).closest('button')) return;
    drag.current = { y0: e.clientY, h0: HEIGHT[detent], t0: e.timeStamp, moved: false };
    sheet.current && (sheet.current.style.transition = 'none');
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onGrabMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !sheet.current) return;
    d.moved = true;
    const h = Math.min(HEIGHT.full, Math.max(HEIGHT.peek, d.h0 + (d.y0 - e.clientY)));
    sheet.current.style.height = `${h}px`;
  };
  const onGrabUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !sheet.current) return;
    sheet.current.style.transition = '';
    if (!d.moved) {
      setDetentState(detent === 'peek' ? 'half' : detent === 'half' ? 'full' : 'half');
      sheet.current.style.height = '';
      return;
    }
    const v = (d.y0 - e.clientY) / Math.max(1, e.timeStamp - d.t0);
    const h = Math.min(HEIGHT.full, Math.max(HEIGHT.peek, d.h0 + (d.y0 - e.clientY))) + v * 180;
    const order: Detent[] = ['peek', 'half', 'full'];
    const target = order.reduce((best, k) => (Math.abs(HEIGHT[k] - h) < Math.abs(HEIGHT[best] - h) ? k : best), 'half' as Detent);
    setDetentState(target);
    sheet.current.style.height = `${HEIGHT[target]}px`;
  };

  if (!meta.ready) {
    return (
      <div className="splash">
        <div className="brand-mark" />
        <div className="brand">MATTANA VITA</div>
      </div>
    );
  }

  if (s.destinations.length === 0) {
    return (
      <UICtx.Provider value={ui}>
        <div className="app">
          <Welcome />
          {modal && <ModalHost m={modal} />}
          {toast && (
            <div className="toast glass" role="status" key={toast.id}>
              {toast.msg}
            </div>
          )}
        </div>
      </UICtx.Provider>
    );
  }

  const dest = activeDest(s);
  const top = stack[stack.length - 1];
  const depth = stack.length;
  const sheetH = wide ? 0 : HEIGHT[detent];
  const insets = wide ? { l: 14 + 404 + 14, t: 64, r: 74, b: 0 } : { l: 0, t: 74, r: 58, b: Math.min(sheetH, vh * 0.58) };
  void currentCp;
  void nextAction;

  let content: React.ReactNode;
  switch (top.k) {
    case 'cp':
      content = <CheckpointView s={s} id={top.id} />;
      break;
    case 'dest':
      content = <DestView s={s} />;
      break;
    case 'numbers':
      content = <NumbersView s={s} />;
      break;
    case 'history':
      content = <HistoryView s={s} />;
      break;
    case 'zones':
      content = <ZonesView s={s} />;
      break;
    case 'settings':
      content = <SettingsView s={s} />;
      break;
    default:
      content = (
        <>
          <Home s={s} />
          <InstallTip />
        </>
      );
  }

  const menuItems: { k: View['k']; l: string; icon: React.ReactNode }[] = [
    { k: 'dest', l: 'Destinazione e timeline', icon: <IconLayers size={18} /> },
    { k: 'numbers', l: 'Numeri', icon: <IconGauge size={18} /> },
    { k: 'history', l: 'Storico delle decisioni', icon: <IconHistory size={18} /> },
    { k: 'zones', l: 'Zone di rischio', icon: <IconZone size={18} /> },
    { k: 'settings', l: 'Impostazioni e backup', icon: <IconGear size={18} /> },
  ];

  const collapsed = wide && detent === 'peek';

  return (
    <UICtx.Provider value={ui}>
      <div className={`app${wide ? ' wide' : ''}`} onPointerDown={() => menu && setMenu(false)}>
        <MapView ref={map} s={s} insets={insets} onCp={openCp} onZone={(id) => setModal({ k: 'zone', id })} onYou={() => map.current?.recenter(true)} />

        <button className="dest-chip glass" style={wide ? { left: 14 + 404 + 14 } : undefined} onClick={() => go({ k: 'dest' })} aria-label={`Destinazione: ${dest.name}`}>
          {dest.tag.toUpperCase() !== dest.name.toUpperCase() && <span className="dc-tag">{dest.tag}</span>}
          <span className="dc-name">{dest.name}</span>
          <IconChevron size={14} />
        </button>

        <div className="ctrls glass">
          <button onClick={() => setFocus(true)} aria-label="Modalità Focus" title="Focus">
            <IconFocus size={21} />
          </button>
          <button onClick={() => setSearching(true)} aria-label="Cerca" title="Cerca (⌘K)">
            <IconSearch size={21} />
          </button>
          <button onClick={() => map.current?.recenter(true)} aria-label="Torna a «Sei qui»" title="Sei qui">
            <IconLocate size={21} />
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMenu((m) => !m)}
            aria-label="Menu"
            aria-expanded={menu}
            title="Menu"
          >
            <IconMore size={21} />
          </button>
        </div>

        {menu && (
          <div className="menu glass" role="menu" onPointerDown={(e) => e.stopPropagation()}>
            {menuItems.map((m) => (
              <button
                key={m.k}
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  go({ k: m.k } as View);
                }}
              >
                {m.icon}
                <span>{m.l}</span>
              </button>
            ))}
          </div>
        )}

        {wide && (
          <div className="zoomc glass">
            <button onClick={() => map.current?.zoomBy(1.35)} aria-label="Ingrandisci">
              <IconPlus size={20} />
            </button>
            <button onClick={() => map.current?.zoomBy(1 / 1.35)} aria-label="Riduci">
              <IconMinus size={20} />
            </button>
          </div>
        )}

        <div
          ref={sheet}
          className={`sheet glass ${detent}${wide ? ' wide' : ''}${collapsed ? ' collapsed' : ''}`}
          style={wide ? undefined : { height: sheetH }}
          role="region"
          aria-label="Pannello"
        >
          <div className="sheet-top" onPointerDown={onGrabDown} onPointerMove={onGrabMove} onPointerUp={onGrabUp} onPointerCancel={onGrabUp}>
            {!wide && <div className="grab-bar" />}
            <header className="sheet-h">
              {depth > 1 ? (
                <button className="back" onClick={back} aria-label="Indietro">
                  <IconBack size={18} />
                  <span>Indietro</span>
                </button>
              ) : (
                <div className="brandline">
                  <i className="brand-mark small" />
                  <span>MATTANA VITA</span>
                </div>
              )}
              <div className="sheet-title">{top.k === 'home' ? '' : TITLES[top.k]}</div>
              {wide ? (
                <button className="icon-btn" onClick={() => setDetent(detent === 'peek' ? 'half' : 'peek')} aria-label={collapsed ? 'Espandi il pannello' : 'Riduci il pannello'}>
                  <IconChevron size={16} />
                </button>
              ) : (
                <span className="tagline">One destination. Stay on route.</span>
              )}
            </header>
          </div>
          <div className="sheet-body" key={top.k + (top.k === 'cp' ? top.id : '')}>
            {content}
          </div>
        </div>

        {focus && <Focus s={s} onExit={() => setFocus(false)} />}
        {searching && <Search s={s} onClose={() => setSearching(false)} />}
        {modal && <ModalHost m={modal} />}
        {toast && (
          <div className="toast glass" role="status" key={toast.id}>
            {toast.msg}
          </div>
        )}
        {!meta.persistOk && <div className="toast glass warn">Salvataggio non disponibile in questo browser: esporta un backup.</div>}
      </div>
    </UICtx.Provider>
  );
}

function ModalHost({ m }: { m: ModalSpec }) {
  switch (m.k) {
    case 'result':
      return <ResultModal cpId={m.cpId} tab={m.tab} />;
    case 'block':
      return <BlockModal cpId={m.cpId} actionId={m.actionId} />;
    case 'recalc':
      return <RecalcModal cpId={m.cpId} actionId={m.actionId} />;
    case 'verify':
      return <VerifyModal cpId={m.cpId} critId={m.critId} />;
    case 'done':
      return <DoneModal cpId={m.cpId} />;
    case 'edit-cp':
      return <EditCheckpointModal cpId={m.cpId} destId={m.destId} />;
    case 'edit-dest':
      return <EditDestModal destId={m.destId} />;
    case 'zone':
      return <ZoneModal id={m.id} />;
    case 'metric':
      return <MetricModal id={m.id} />;
    case 'reading':
      return <ReadingModal metricId={m.metricId} />;
    case 'confirm':
      return <ConfirmModal title={m.title} body={m.body} ok={m.ok} danger={m.danger} onOk={m.onOk} />;
  }
}
