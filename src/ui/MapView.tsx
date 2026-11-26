import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cpStatus, cpsOf, destById, progress, routePos } from '../lib/engine';
import { TOPO_W, TOPO_X0, buildContours, buildRoute, pathBetween, placeZones, pointAt } from '../lib/route';
import type { State } from '../lib/types';
import { clamp } from '../lib/util';

export interface MapHandle {
  recenter(animate?: boolean): void;
  zoomBy(f: number): void;
  focusStop(stop: number): void;
}

export interface Insets {
  l: number;
  t: number;
  r: number;
  b: number;
}

interface Props {
  s: State;
  insets: Insets;
  onCp(id: string): void;
  onZone(id: string): void;
  onYou(): void;
}

function wrap(text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) {
    const two = lines.slice(0, 2);
    two[1] = two[1].replace(/.{0,2}$/, '') + '…';
    return two;
  }
  return lines;
}

const Topo = memo(function Topo({ H }: { H: number }) {
  const contours = useMemo(() => buildContours(H), [H]);
  return (
    <g className="topo">
      {contours.map((c) => (
        <path key={c.idx} d={c.d} className={c.major ? 'major' : 'minor'} />
      ))}
    </g>
  );
});

export const MapView = forwardRef<MapHandle, Props>(function MapView({ s, insets, onCp, onZone, onYou }, ref) {
  const dest = destById(s, s.activeDestId) ?? s.destinations[0];
  const list = cpsOf(s, dest.id);
  const n = list.length;
  const route = useMemo(() => buildRoute(Math.max(n, 1)), [n]);
  const zoneKey = s.zones.map((z) => z.id).join('|');
  const zones = useMemo(() => placeZones(route, zoneKey ? zoneKey.split('|') : []), [route, zoneKey]);
  const rp = routePos(s, dest.id);
  const you = pointAt(route, rp.pos);
  const donePath = rp.pos > 0 ? pathBetween(route, 0, rp.pos) : '';
  const restPath = rp.pos < n ? pathBetween(route, rp.pos, n) : '';
  const fullPath = pathBetween(route, 0, n);
  const flag = route.stops[n];
  const hits = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of s.focus) for (const d of f.distractions) if (d.zoneId) m.set(d.zoneId, (m.get(d.zoneId) ?? 0) + 1);
    return m;
  }, [s.focus]);

  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const cam = useRef({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const raf = useRef(0);
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const posRef = useRef(rp.pos);
  posRef.current = rp.pos;
  const nRef = useRef(n);
  nRef.current = n;
  const routeRef = useRef(route);
  routeRef.current = route;

  const apply = useCallback(() => {
    const c = cam.current;
    gRef.current?.setAttribute('transform', `translate(${c.x.toFixed(2)} ${c.y.toFixed(2)}) scale(${c.k.toFixed(4)})`);
    if (svgRef.current) svgRef.current.dataset.z = c.k < 0.62 ? 'far' : c.k > 1.4 ? 'near' : 'mid';
  }, []);

  const limits = useCallback(() => {
    const { w, h } = size.current;
    const H = routeRef.current.H;
    const minK = Math.max(0.42, w / TOPO_W, h / (H + 400));
    return { minK, maxK: 2.6 };
  }, []);

  const clampCam = useCallback(() => {
    const { w, h } = size.current;
    const H = routeRef.current.H;
    const c = cam.current;
    const { minK, maxK } = limits();
    c.k = clamp(c.k, minK, maxK);
    c.x = clamp(c.x, w - (TOPO_X0 + TOPO_W) * c.k, -TOPO_X0 * c.k);
    c.y = clamp(c.y, h - (H + 200) * c.k, 200 * c.k);
  }, [limits]);

  const visibleCenter = useCallback(() => {
    const { w, h } = size.current;
    const i = insetsRef.current;
    return { x: i.l + (w - i.l - i.r) / 2, y: i.t + (h - i.t - i.b) / 2 };
  }, []);

  const animateTo = useCallback(
    (wx: number, wy: number, k: number, ms: number) => {
      cancelAnimationFrame(raf.current);
      const { minK, maxK } = limits();
      const k1 = clamp(k, minK, maxK);
      const vc = visibleCenter();
      const from = { ...cam.current };
      const to = { k: k1, x: vc.x - wx * k1, y: vc.y - wy * k1 };
      if (ms <= 0) {
        cam.current = to;
        clampCam();
        apply();
        return;
      }
      const t0 = performance.now();
      const step = (now: number) => {
        const p = clamp((now - t0) / ms, 0, 1);
        const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        cam.current = { k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
        clampCam();
        apply();
        if (p < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    },
    [apply, clampCam, limits, visibleCenter],
  );

  const homeK = useCallback(() => {
    const i = insetsRef.current;
    const vw = size.current.w - i.l - i.r;
    return clamp(vw / 700, 0.72, 1.12);
  }, []);

  const recenter = useCallback(
    (animate = true) => {
      const r = routeRef.current;
      const look = pointAt(r, Math.min(posRef.current + 0.4, nRef.current));
      animateTo(look.x, look.y, homeK(), animate ? 700 : 0);
    },
    [animateTo, homeK],
  );

  useImperativeHandle(
    ref,
    () => ({
      recenter,
      zoomBy(f: number) {
        const c = cam.current;
        const vc = visibleCenter();
        const wx = (vc.x - c.x) / c.k;
        const wy = (vc.y - c.y) / c.k;
        animateTo(wx, wy, c.k * f, 260);
      },
      focusStop(stop: number) {
        const p = pointAt(routeRef.current, stop);
        animateTo(p.x, p.y, Math.max(cam.current.k, homeK()), 650);
      },
    }),
    [animateTo, homeK, recenter, visibleCenter],
  );

  // size observer + first placement
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      size.current = { w: r.width, h: r.height };
      if (!ready && r.width > 0) {
        setReady(true);
        recenter(false);
      } else {
        clampCam();
        apply();
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [apply, clampCam, ready, recenter]);

  // new destination: jump to it. progress moved: glide to the new position.
  const lastDest = useRef(dest.id);
  const lastPos = useRef(rp.pos);
  useEffect(() => {
    if (!ready) return;
    if (lastDest.current !== dest.id) {
      lastDest.current = dest.id;
      lastPos.current = rp.pos;
      recenter(false);
    } else if (Math.abs(lastPos.current - rp.pos) > 1e-6) {
      lastPos.current = rp.pos;
      recenter(true);
    }
  }, [dest.id, rp.pos, ready, recenter]);

  // gestures
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ptrs = new Map<number, { x: number; y: number }>();
    let moved = false;
    let pinch: { d: number; k: number; wx: number; wy: number } | null = null;
    let last = { x: 0, y: 0, t: 0 };
    let vel = { x: 0, y: 0 };
    const rect = () => el.getBoundingClientRect();

    const down = (e: PointerEvent) => {
      cancelAnimationFrame(raf.current);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      vel = { x: 0, y: 0 };
      last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const r = rect();
        const mx = (a.x + b.x) / 2 - r.left;
        const my = (a.y + b.y) / 2 - r.top;
        const c = cam.current;
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: c.k, wx: (mx - c.x) / c.k, wy: (my - c.y) / c.k };
      }
    };
    const move = (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (ptrs.size === 1) {
        if (!moved && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 5 && e.timeStamp - last.t < 4000) {
          if (!moved) return;
        }
        if (!moved) {
          moved = true;
          try {
            el.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }
        const dt = Math.max(1, e.timeStamp - last.t);
        vel = { x: (dx / dt) * 0.6 + vel.x * 0.4, y: (dy / dt) * 0.6 + vel.y * 0.4 };
        last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        cam.current.x += dx;
        cam.current.y += dy;
        clampCam();
        apply();
      } else if (ptrs.size === 2 && pinch) {
        moved = true;
        const [a, b] = [...ptrs.values()];
        const r = rect();
        const mx = (a.x + b.x) / 2 - r.left;
        const my = (a.y + b.y) / 2 - r.top;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const { minK, maxK } = limits();
        const k = clamp(pinch.k * (d / pinch.d), minK, maxK);
        cam.current = { k, x: mx - pinch.wx * k, y: my - pinch.wy * k };
        clampCam();
        apply();
      }
    };
    const up = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (ptrs.size === 0 && moved) {
        let vx = vel.x * 16;
        let vy = vel.y * 16;
        if (Math.hypot(vx, vy) > 3) {
          const glide = () => {
            vx *= 0.93;
            vy *= 0.93;
            cam.current.x += vx;
            cam.current.y += vy;
            clampCam();
            apply();
            if (Math.hypot(vx, vy) > 0.4) raf.current = requestAnimationFrame(glide);
          };
          raf.current = requestAnimationFrame(glide);
        }
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(raf.current);
      const c = cam.current;
      if (e.ctrlKey || e.metaKey) {
        const r = rect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        const { minK, maxK } = limits();
        const k = clamp(c.k * Math.exp(-e.deltaY * 0.012), minK, maxK);
        const wx = (mx - c.x) / c.k;
        const wy = (my - c.y) / c.k;
        cam.current = { k, x: mx - wx * k, y: my - wy * k };
      } else {
        const m = e.deltaMode === 1 ? 16 : 1;
        c.x -= e.deltaX * m;
        c.y -= e.deltaY * m;
      }
      clampCam();
      apply();
    };
    const dbl = (e: MouseEvent) => {
      const r = rect();
      const c = cam.current;
      const wx = (e.clientX - r.left - c.x) / c.k;
      const wy = (e.clientY - r.top - c.y) / c.k;
      const vc = visibleCenter();
      // zoom in keeping the tapped point where it is
      const k = clamp(c.k * 1.7, limits().minK, limits().maxK);
      const target = { k, x: e.clientX - r.left - wx * k, y: e.clientY - r.top - wy * k };
      const from = { ...c };
      const t0 = performance.now();
      cancelAnimationFrame(raf.current);
      void vc;
      const step = (now: number) => {
        const p = clamp((now - t0) / 260, 0, 1);
        const q = 1 - Math.pow(1 - p, 3);
        cam.current = { k: from.k + (target.k - from.k) * q, x: from.x + (target.x - from.x) * q, y: from.y + (target.y - from.y) * q };
        clampCam();
        apply();
        if (p < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    };

    // Safari on macOS reports trackpad pinch as gesture events, not ctrl+wheel
    type GE = Event & { scale: number; clientX?: number; clientY?: number };
    let g0: { k: number; wx: number; wy: number } | null = null;
    const gpoint = (e: GE) => {
      const r = rect();
      return { x: (e.clientX ?? r.left + r.width / 2) - r.left, y: (e.clientY ?? r.top + r.height / 2) - r.top };
    };
    const gstart = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf.current);
      const m = gpoint(e as GE);
      const c = cam.current;
      g0 = { k: c.k, wx: (m.x - c.x) / c.k, wy: (m.y - c.y) / c.k };
    };
    const gchange = (e: Event) => {
      e.preventDefault();
      if (!g0) return;
      const m = gpoint(e as GE);
      const { minK, maxK } = limits();
      const k = clamp(g0.k * (e as GE).scale, minK, maxK);
      cam.current = { k, x: m.x - g0.wx * k, y: m.y - g0.wy * k };
      clampCam();
      apply();
    };
    const gend = () => {
      g0 = null;
    };
    el.addEventListener('gesturestart', gstart);
    el.addEventListener('gesturechange', gchange);
    el.addEventListener('gestureend', gend);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('dblclick', dbl);
    return () => {
      el.removeEventListener('gesturestart', gstart);
      el.removeEventListener('gesturechange', gchange);
      el.removeEventListener('gestureend', gend);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('dblclick', dbl);
      cancelAnimationFrame(raf.current);
    };
  }, [apply, clampCam, limits, visibleCenter]);

  const done = rp.done >= n;
  const currentIdx = rp.done; // zero based

  return (
    <svg ref={svgRef} className="map" data-z="mid" role="img" aria-label={`Mappa della rotta verso ${dest.name}`}>
      <defs>
        <linearGradient id="routeG" gradientUnits="userSpaceOnUse" x1="0" y1={route.H} x2="0" y2="0">
          <stop offset="0" stopColor="#1b66ff" />
          <stop offset="0.6" stopColor="#3d8bff" />
          <stop offset="1" stopColor="#7cc4ff" />
        </linearGradient>
        <radialGradient id="goalG">
          <stop offset="0" stopColor="#8fd0ff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#3d8bff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cone" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3d8bff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#3d8bff" stopOpacity="0" />
        </linearGradient>
        <pattern id="hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(255,105,90,.22)" strokeWidth="2" />
        </pattern>
      </defs>
      <g ref={gRef} className="world">
        <Topo H={route.H} />

        <g className="zones">
          {zones.map((z) => {
            const zone = s.zones.find((x) => x.id === z.id);
            if (!zone) return null;
            const h = hits.get(z.id) ?? 0;
            return (
              <g key={z.id} className="zone" onClick={() => onZone(z.id)}>
                <path d={z.d} className="zone-fill" />
                <text x={z.cx} y={z.cy} className="zone-label" textAnchor="middle">
                  {wrap(zone.name.toUpperCase(), 16).map((ln, i, arr) => (
                    <tspan key={i} x={z.cx} dy={i === 0 ? `${-(arr.length - 1) * 0.55}em` : '1.15em'}>
                      {ln}
                    </tspan>
                  ))}
                </text>
                {h > 0 && (
                  <g transform={`translate(${z.cx + z.rx * 0.62} ${z.cy - z.ry * 0.62})`}>
                    <circle r="13" fill="#ff5d4d" />
                    <text className="zone-hit" textAnchor="middle" dy="5">
                      {h}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        <g className="route" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={fullPath} stroke="#3d8bff" strokeOpacity="0.05" strokeWidth="56" />
          <path d={fullPath} stroke="#3d8bff" strokeOpacity="0.09" strokeWidth="36" />
          {restPath && <path d={restPath} stroke="#3d8bff" strokeOpacity="0.55" strokeWidth="7" />}
          {restPath && <path d={restPath} className="flow" stroke="#d6e8ff" strokeWidth="3.2" strokeDasharray="1 22" />}
          {donePath && (
            <>
              <path d={donePath} stroke="#3d8bff" strokeOpacity="0.22" strokeWidth="30" />
              <path d={donePath} stroke="url(#routeG)" strokeWidth="9" />
              <path d={donePath} stroke="#e3f0ff" strokeOpacity="0.9" strokeWidth="2.6" />
            </>
          )}
        </g>

        {rp.pos > 0.05 && (
          <g transform={`translate(${route.stops[0].x} ${route.stops[0].y})`} className="lbl">
            <circle r="8" fill="#050914" stroke="#8ab8ff" strokeWidth="2.5" />
            <text className="start-label" x="16" y="5">
              PARTENZA
            </text>
          </g>
        )}

        {list.map((cp, idx) => {
          const stop = route.stops[idx + 1];
          const st = cpStatus(s, cp);
          const isCur = idx === currentIdx && !done;
          const p = progress(s, cp);
          const right = idx % 2 === 0;
          const lines = wrap(cp.title, 24);
          const sub = st === 'done' ? 'Raggiunto' : st === 'locked' ? 'In attesa' : `${p.met} di ${p.total} criteri`;
          const w = Math.max(...lines.map((l) => l.length), sub.length, isCur ? 20 : 0) * 7.3 + 26;
          const hgt = 18 + lines.length * 17 + 16 + (isCur ? 16 : 0);
          const off = isCur ? 40 : 30;
          const x0 = right ? off : -off - w;
          return (
            <g
              key={cp.id}
              className={`node ${st}${isCur ? ' cur' : ''}`}
              transform={`translate(${stop.x} ${stop.y})`}
              onClick={() => onCp(cp.id)}
              role="button"
              tabIndex={0}
              aria-label={`Checkpoint ${idx + 1}: ${cp.title}. ${sub}`}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onCp(cp.id)}
            >
              <circle r="38" fill="transparent" />
              {isCur && <circle r="30" className="pulse" />}
              {st === 'done' ? (
                <>
                  <circle r="17" fill="#2f7bff" stroke="#07102a" strokeWidth="3" />
                  <path d="M-6.5 0.5l4.6 4.8 8.6-10" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : st === 'active' ? (
                <>
                  <circle r="21" fill="#0a84ff" stroke="#fff" strokeWidth="3.5" />
                  <text className="node-n" textAnchor="middle" dy="6">
                    {idx + 1}
                  </text>
                </>
              ) : (
                <>
                  <circle r="14" fill="#0a1226" stroke="rgba(150,180,255,.4)" strokeWidth="2" />
                  <text className="node-n dim" textAnchor="middle" dy="5">
                    {idx + 1}
                  </text>
                </>
              )}
              <g className="lbl" transform={`translate(${x0} ${-hgt / 2})`}>
                <rect width={w} height={hgt} rx="13" className={`pill${isCur ? ' cur' : ''}`} />
                {isCur && (
                  <text x="13" y="17" className="pill-tag">
                    PROSSIMO CHECKPOINT
                  </text>
                )}
                {lines.map((ln, i) => (
                  <text key={i} x="13" y={(isCur ? 17 : 0) + 22 + i * 17} className="pill-title">
                    {ln}
                  </text>
                ))}
                <text x="13" y={(isCur ? 17 : 0) + 22 + lines.length * 17 + 1} className="pill-sub">
                  {sub}
                </text>
              </g>
            </g>
          );
        })}

        <g transform={`translate(${flag.x} ${flag.y})`} className="goal" onClick={() => onCp(list[n - 1]?.id)}>
          <circle r="86" fill="url(#goalG)" className="goal-glow" />
          <line x1="0" y1="0" x2="0" y2="-88" stroke="#eaf3ff" strokeWidth="4" strokeLinecap="round" />
          <path className="flag" d="M3 -88 C 30 -100 46 -78 80 -88 L80 -50 C 46 -40 30 -62 3 -52 Z" fill="#eaf3ff" />
          <text className="goal-tag" textAnchor="middle" y="-132">
            DESTINAZIONE
          </text>
          <text className="goal-name" textAnchor="middle" y="-108">
            {dest.name}
          </text>
        </g>

        <g transform={`translate(${you.x} ${you.y})`} className="you" onClick={onYou}>
          <circle r="40" fill="transparent" />
          <circle r="18" className="you-pulse" />
          {!done && <path d="M0 -15 L-17 -52 Q0 -64 17 -52 Z" fill="url(#cone)" transform={`rotate(${(you.a * 180) / Math.PI + 90})`} className="cone" />}
          <circle r="15" fill="#fff" />
          <circle r="10.5" fill="#0a84ff" />
          <g className="lbl" transform="translate(0 -78)">
            <rect x="-45" y="-17" width="90" height="34" rx="17" className="you-pill" />
            <path d="M-7 17 L0 25 L7 17 Z" className="you-tail" />
            <text textAnchor="middle" y="6" className="you-text">
              {done ? 'Arrivato' : 'Sei qui'}
            </text>
          </g>
        </g>
      </g>
    </svg>
  );
});
