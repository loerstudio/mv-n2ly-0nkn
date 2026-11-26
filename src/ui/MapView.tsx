import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cpStatus, cpsOf, destById, routePos } from '../lib/engine';
import { TERRAIN, buildRoute, buildTerrain, pathBetween, placeZones, pointAt } from '../lib/route';
import type { Checkpoint, State } from '../lib/types';
import { clamp } from '../lib/util';
import { IconChart, IconCheck, IconDumbbell, IconFlag, IconHeart, IconPlane, IconRocket, IconUsers, IconWallet, IconWarn } from './icons';

export interface MapHandle {
  /** close-up on "Sei qui" */
  recenter(animate?: boolean): void;
  /** the whole route in view, like the overview of a navigation app */
  fit(animate?: boolean): void;
  /** close-up on "Sei qui", or back to the overview when already close */
  toggle(): void;
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

interface Item {
  id: string;
  kind: 'cp' | 'goal' | 'you' | 'zone' | 'start';
  wx: number;
  wy: number;
  prio: number;
  nodeR: number;
  label: boolean;
}
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const HILL_FILL = ['#09201c', '#0b2621', '#0e2d26', '#11352c', '#173f33'];

function cpIcon(s: State, cp: Checkpoint, goal: boolean): ReactNode {
  if (goal) return <IconRocket size={19} />;
  const t = cp.title.toLowerCase();
  if (/cliente|client|persone|conosc|connession|community|relazion|compatib|abbonament/.test(t)) return <IconUsers size={19} />;
  if (/allena|sedut|aliment|sonno|muscol|fisic|misurazion|recupero/.test(t)) return <IconDumbbell size={19} />;
  if (/viagg|libert|remot|esperien/.test(t)) return <IconPlane size={19} />;
  if (/amor|partner|giappon/.test(t)) return <IconHeart size={19} />;
  const eur = cp.criteria.some((c) => c.target && s.metrics.find((m) => m.id === c.target!.metricId)?.unit === 'eur') || /mrr|€|riserva|patrimon|indipend|reddito|fattur/.test(t);
  if (eur) return /riserva|patrimon/.test(t) ? <IconWallet size={19} /> : <IconChart size={19} />;
  return <IconFlag size={19} />;
}

const Terrain = memo(function Terrain() {
  const t = useMemo(() => buildTerrain(), []);
  return (
    <g className="terrain">
      {t.hills.map((h) => (
        <path key={`h${h.level}`} d={h.d} fill={HILL_FILL[h.level]} fillOpacity={0.2 + h.level * 0.06} fillRule="evenodd" />
      ))}
      {t.lines.map((l, i) => (
        <path key={`l${i}`} d={l.d} className={l.major ? 'cl major' : 'cl'} />
      ))}
      {t.water.map((w) => (
        <path key={`w${w.level}`} d={w.d} fill={w.level ? '#0a2f62' : '#071f48'} fillOpacity={w.level ? 0.92 : 0.85} fillRule="evenodd" className="water" />
      ))}
      {t.roads.map((r, i) => (
        <path key={`r${i}`} d={r.d} className={r.major ? 'road major' : 'road'} />
      ))}
    </g>
  );
});

export const MapView = forwardRef<MapHandle, Props>(function MapView({ s, insets, onCp, onZone, onYou }, ref) {
  const dest = destById(s, s.activeDestId) ?? s.destinations[0];
  const list = cpsOf(s, dest.id);
  const n = Math.max(list.length, 1);
  const route = useMemo(() => buildRoute(n), [n]);
  const zoneKey = s.zones.map((z) => z.id).join('|');
  const zones = useMemo(() => placeZones(route, zoneKey ? zoneKey.split('|') : []), [route, zoneKey]);
  const rp = routePos(s, dest.id);
  const you = pointAt(route, rp.pos);
  const donePath = rp.pos > 0.001 ? pathBetween(route, 0, rp.pos) : '';
  const fullPath = pathBetween(route, 0, n);
  const hits = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of s.focus) for (const d of f.distractions) if (d.zoneId) m.set(d.zoneId, (m.get(d.zoneId) ?? 0) + 1);
    return m;
  }, [s.focus]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const cam = useRef({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 0, h: 0 });
  const raf = useRef(0);
  const [ready, setReady] = useState(false);
  const touched = useRef(false);
  const reg = useRef(new Map<string, { node?: HTMLElement | null; label?: HTMLElement | null; flag?: HTMLElement | null }>());
  const sizes = useRef(new Map<string, { w: number; h: number }>());
  const itemsRef = useRef<Item[]>([]);
  const zonesRef = useRef<{ id: string; rx: number; ry: number }[]>([]);
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const routeRef = useRef(route);
  routeRef.current = route;
  const posRef = useRef(rp.pos);
  posRef.current = rp.pos;

  const setEl = (id: string, key: 'node' | 'label' | 'flag') => (el: HTMLElement | null) => {
    const cur = reg.current.get(id) ?? {};
    cur[key] = el;
    reg.current.set(id, cur);
  };

  // everything that is drawn at a constant size on screen
  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    const cur = rp.done;
    list.forEach((cp, i) => {
      const goal = i === list.length - 1;
      const stop = route.stops[i + 1];
      const prio = goal ? 92 : i === cur ? 95 : i === cur + 1 ? 88 : i === cur + 2 ? 82 : i === cur - 1 ? 70 : 38 - i * 0.01;
      out.push({ id: `cp:${cp.id}`, kind: goal ? 'goal' : 'cp', wx: stop.x, wy: stop.y, prio, nodeR: goal ? 13 : i === cur ? 13 : 7, label: true });
    });
    if (rp.pos > 0.05) out.push({ id: 'start', kind: 'start', wx: route.stops[0].x, wy: route.stops[0].y, prio: 0, nodeR: 7, label: false });
    out.push({ id: 'you', kind: 'you', wx: you.x, wy: you.y, prio: 93, nodeR: 15, label: true });
    zones.forEach((z, i) => out.push({ id: `zone:${z.id}`, kind: 'zone', wx: z.cx, wy: z.cy, prio: i < 5 ? 60 - i : 30 - i, nodeR: 0, label: true }));
    return out;
  }, [list, route, rp.done, rp.pos, you.x, you.y, zones]);
  itemsRef.current = items;
  zonesRef.current = zones;

  // place nodes, then labels by priority, never overlapping
  const layout = useCallback(() => {
    const { w, h } = size.current;
    if (!w) return;
    const c = cam.current;
    const ins = insetsRef.current;
    const vis: Box = { x0: ins.l + 6, y0: ins.t + 2, x1: w - ins.r - 6, y1: h - ins.b - 4 };
    const nodesBox: Box[] = [];
    const labelsBox: Box[] = [];
    const pos = new Map<string, { sx: number; sy: number }>();
    for (const it of itemsRef.current) {
      const sx = it.wx * c.k + c.x;
      const sy = it.wy * c.k + c.y;
      pos.set(it.id, { sx, sy });
      const els = reg.current.get(it.id);
      if (els?.node) els.node.style.transform = `translate3d(${(sx - it.nodeR).toFixed(1)}px, ${(sy - it.nodeR).toFixed(1)}px, 0)`;
      if (els?.flag) els.flag.style.transform = `translate3d(${(sx - 6).toFixed(1)}px, ${(sy - 52).toFixed(1)}px, 0)`;
      if (it.nodeR > 0) nodesBox.push({ x0: sx - it.nodeR - 2, y0: sy - it.nodeR - 2, x1: sx + it.nodeR + 2, y1: sy + it.nodeR + 2 });
    }
    const inside = (b: Box) => b.x0 >= vis.x0 && b.x1 <= vis.x1 && b.y0 >= vis.y0 && b.y1 <= vis.y1;
    const hit = (a: Box, b: Box) => a.x0 < b.x1 + 5 && a.x1 > b.x0 - 5 && a.y0 < b.y1 + 4 && a.y1 > b.y0 - 4;
    const labelled = itemsRef.current.filter((i) => i.label).sort((a, b) => b.prio - a.prio);
    for (const it of labelled) {
      const el = reg.current.get(it.id)?.label;
      if (!el) continue;
      const { sx, sy } = pos.get(it.id)!;
      const sz = sizes.current.get(it.id) ?? { w: 130, h: 40 };
      const gap = it.nodeR + 8;
      let cands: [number, number][];
      if (it.kind === 'zone') {
        // anywhere inside the territory, as long as it stays readable and clear of the road labels
        const z = zonesRef.current.find((q) => `zone:${q.id}` === it.id);
        const rxk = (z?.rx ?? 80) * c.k;
        const ryk = (z?.ry ?? 60) * c.k;
        cands = [];
        for (const [ox, oy] of [[0, 0], [0.6, 0], [-0.6, 0], [0.85, 0], [-0.85, 0], [0, 0.55], [0, -0.55], [0.5, 0.45], [-0.5, 0.45], [0.5, -0.45], [-0.5, -0.45]]) {
          const cx = sx + ox * rxk;
          const cy = sy + oy * ryk;
          const px = clamp(cx - sz.w / 2, vis.x0, vis.x1 - sz.w);
          const py = clamp(cy - sz.h / 2, vis.y0, vis.y1 - sz.h);
          const ex = (px + sz.w / 2 - sx) / rxk;
          const ey = (py + sz.h / 2 - sy) / ryk;
          if (ex * ex + ey * ey < 1.1) cands.push([px, py]);
        }
      } else if (it.kind === 'you') {
        // away from the road ahead, so the next checkpoint keeps its label
        cands = [
          [sx + gap - 4, sy + 3],
          [sx - sz.w / 2 + 6, sy + gap],
          [sx - gap - sz.w, sy + 3],
          [sx + gap, sy - sz.h / 2],
          [sx - gap - sz.w, sy - sz.h / 2],
          [sx - sz.w / 2, sy - gap - sz.h],
        ];
      } else {
        cands = [
          [sx + gap, sy - sz.h / 2 - 8],
          [sx + gap - 2, sy - sz.h - 2],
          [sx + gap, sy - sz.h / 2 + 10],
          [sx + gap - 2, sy + 2],
          [sx - gap - sz.w, sy - sz.h / 2],
          [sx - gap - sz.w + 2, sy - sz.h - 2],
          [sx - gap - sz.w + 2, sy + 2],
          [sx - sz.w / 2, sy - gap - sz.h],
          [sx - sz.w / 2, sy + gap],
        ];
      }
      // the labels that matter most are never pushed away by a neighbouring dot
      const hard = it.prio >= 85 || it.kind === 'zone';
      let ok = false;
      for (const [bx, by] of cands) {
        const box: Box = { x0: bx, y0: by, x1: bx + sz.w, y1: by + sz.h };
        if (inside(box) && !labelsBox.some((p) => hit(p, box)) && (hard || !nodesBox.some((p) => hit(p, box)))) {
          el.style.transform = `translate3d(${bx.toFixed(1)}px, ${by.toFixed(1)}px, 0)`;
          el.style.opacity = '1';
          el.style.pointerEvents = 'auto';
          labelsBox.push(box);
          ok = true;
          break;
        }
      }
      if (!ok) {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      }
    }
  }, []);

  const apply = useCallback(() => {
    const c = cam.current;
    gRef.current?.setAttribute('transform', `translate(${c.x.toFixed(2)} ${c.y.toFixed(2)}) scale(${c.k.toFixed(4)})`);
    layout();
  }, [layout]);

  const FIT = { t: 34, b: 62, l: 30, r: 30 };
  const fitK = useCallback(() => {
    const { w, h } = size.current;
    const i = insetsRef.current;
    const bb = routeRef.current.bbox;
    const bw = bb.x1 - bb.x0 + 80;
    const bh = bb.y1 - bb.y0 + 60;
    return clamp(Math.min((w - i.l - i.r - FIT.l - FIT.r) / bw, (h - i.t - i.b - FIT.t - FIT.b) / bh), 0.2, 1.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const limits = useCallback(() => {
    const { w, h } = size.current;
    const cover = Math.max(w / TERRAIN.w, h / TERRAIN.h);
    return { minK: Math.max(cover, fitK() * 0.7), maxK: 3.2 };
  }, [fitK]);

  const clampCam = useCallback(() => {
    const { w, h } = size.current;
    const c = cam.current;
    const { minK, maxK } = limits();
    c.k = clamp(c.k, minK, maxK);
    c.x = clamp(c.x, w - (TERRAIN.x0 + TERRAIN.w) * c.k, -TERRAIN.x0 * c.k);
    c.y = clamp(c.y, h - (TERRAIN.y0 + TERRAIN.h) * c.k, -TERRAIN.y0 * c.k);
  }, [limits]);

  const visibleCenter = useCallback(() => {
    const { w, h } = size.current;
    const i = insetsRef.current;
    return { x: i.l + (w - i.l - i.r) / 2, y: i.t + (h - i.t - i.b) / 2 };
  }, []);

  const animateTo = useCallback(
    (wx: number, wy: number, k: number, ms: number, shift = { x: 0, y: 0 }) => {
      cancelAnimationFrame(raf.current);
      const { minK, maxK } = limits();
      const k1 = clamp(k, minK, maxK);
      const vc0 = visibleCenter();
      const vc = { x: vc0.x + shift.x, y: vc0.y + shift.y };
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

  const fit = useCallback(
    (animate = true) => {
      touched.current = false;
      const bb = routeRef.current.bbox;
      animateTo((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, fitK(), animate ? 750 : 0, { x: (FIT.l - FIT.r) / 2, y: (FIT.t - FIT.b) / 2 });
    },
    [animateTo, fitK],
  );

  const recenter = useCallback(
    (animate = true) => {
      touched.current = true;
      const look = pointAt(routeRef.current, Math.min(posRef.current + 0.35, nRefLast(routeRef.current)));
      animateTo(look.x, look.y, Math.max(fitK() * 2.1, 0.95), animate ? 750 : 0);
    },
    [animateTo, fitK],
  );

  useImperativeHandle(
    ref,
    () => ({
      recenter,
      fit,
      toggle() {
        if (cam.current.k > fitK() * 1.5) fit(true);
        else recenter(true);
      },
      zoomBy(f: number) {
        const c = cam.current;
        const vc = visibleCenter();
        animateTo((vc.x - c.x) / c.k, (vc.y - c.y) / c.k, c.k * f, 260);
      },
      focusStop(stop: number) {
        touched.current = true;
        const p = pointAt(routeRef.current, stop);
        animateTo(p.x, p.y, Math.max(cam.current.k, 0.85), 650);
      },
    }),
    [animateTo, fit, fitK, recenter, visibleCenter],
  );

  // after every render: measure the pills, then lay everything out
  useLayoutEffect(() => {
    for (const it of items) {
      const el = reg.current.get(it.id)?.label;
      if (el) sizes.current.set(it.id, { w: el.offsetWidth, h: el.offsetHeight });
    }
    apply();
  });

  // size observer + first placement
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      size.current = { w: r.width, h: r.height };
      if (!ready && r.width > 0) {
        setReady(true);
        fit(false);
      } else {
        clampCam();
        apply();
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [apply, clampCam, fit, ready]);

  // a different destination: show its whole route
  const lastDest = useRef(dest.id);
  useEffect(() => {
    if (!ready) return;
    if (lastDest.current !== dest.id) {
      lastDest.current = dest.id;
      fit(false);
    }
  }, [dest.id, ready, fit]);

  // re-fit when the free area changes (sheet opens, panel appears, rotation)
  const lastInsets = useRef(`${insets.l}|${insets.t}|${insets.r}|${insets.b}`);
  useEffect(() => {
    const k = `${insets.l}|${insets.t}|${insets.r}|${insets.b}`;
    if (!ready || k === lastInsets.current) return;
    lastInsets.current = k;
    if (!touched.current) fit(false);
    else apply();
  }, [insets, ready, apply, fit]);

  // gestures
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ptrs = new Map<number, { x: number; y: number }>();
    let moved = false;
    let pinch: { d: number; k: number; wx: number; wy: number } | null = null;
    let last = { x: 0, y: 0, t: 0 };
    let vel = { x: 0, y: 0 };
    const rect = () => el.getBoundingClientRect();

    const down = (e: PointerEvent) => {
      touched.current = true;
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
        if (!moved) {
          if (Math.hypot(e.clientX - last.x, e.clientY - last.y) < 6) return;
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
      touched.current = true;
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
      if ((e.target as HTMLElement).closest('.mpill, .mnode, .myou')) return;
      const r = rect();
      const c = cam.current;
      const wx = (e.clientX - r.left - c.x) / c.k;
      const wy = (e.clientY - r.top - c.y) / c.k;
      const { minK, maxK } = limits();
      const k = clamp(c.k * 1.7, minK, maxK);
      const target = { k, x: e.clientX - r.left - wx * k, y: e.clientY - r.top - wy * k };
      const from = { ...c };
      const t0 = performance.now();
      cancelAnimationFrame(raf.current);
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
  }, [apply, clampCam, limits]);

  const doneAll = rp.done >= list.length;
  const cur = rp.done;

  return (
    <div className="mapwrap" ref={wrapRef}>
      <svg className="map" role="img" aria-label={`Mappa della rotta verso ${dest.name}`}>
        <defs>
          <radialGradient id="zoneG">
            <stop offset="0" stopColor="#7a1626" stopOpacity="0.34" />
            <stop offset="0.75" stopColor="#5f101d" stopOpacity="0.22" />
            <stop offset="1" stopColor="#480c16" stopOpacity="0.1" />
          </radialGradient>
          <pattern id="hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">
            <line x1="0" y1="0" x2="0" y2="9" stroke="rgba(255,98,98,.2)" strokeWidth="1.3" />
          </pattern>
          <linearGradient id="routeG" gradientUnits="userSpaceOnUse" x1="120" y1="700" x2="700" y2="90">
            <stop offset="0" stopColor="#0f6bff" />
            <stop offset="1" stopColor="#1f94ff" />
          </linearGradient>
        </defs>
        <g ref={gRef} className="world">
          <Terrain />
          <g className="zones">
            {zones.map((z) => {
              const zone = s.zones.find((x) => x.id === z.id);
              if (!zone) return null;
              return (
                <g key={z.id} className="zone" onClick={() => onZone(z.id)}>
                  <path d={z.d} className="zone-glow" />
                  <path d={z.d} fill="url(#zoneG)" />
                  <path d={z.d} fill="url(#hatch)" />
                  <path d={z.d} className="zone-line" />
                </g>
              );
            })}
          </g>
          <g className="route" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={fullPath} className="rg" stroke="#1673ff" strokeOpacity="0.04" strokeWidth="96" />
            <path d={fullPath} className="rg" stroke="#1673ff" strokeOpacity="0.07" strokeWidth="66" />
            <path d={fullPath} className="rg" stroke="#1a7bff" strokeOpacity="0.12" strokeWidth="44" />
            <path d={fullPath} className="rg" stroke="#1d80ff" strokeOpacity="0.22" strokeWidth="29" />
            <path d={fullPath} className="rg" stroke="url(#routeG)" strokeWidth="12" />
            <path d={fullPath} className="rg" stroke="#8fe0ff" strokeOpacity="0.95" strokeWidth="3.2" />
            {donePath && (
              <>
                <path d={donePath} className="rg" stroke="#5db8ff" strokeOpacity="0.3" strokeWidth="24" />
                <path d={donePath} className="rg" stroke="#6cc2ff" strokeWidth="9" />
                <path d={donePath} className="rg" stroke="#ffffff" strokeOpacity="0.95" strokeWidth="3" />
              </>
            )}
          </g>
        </g>
      </svg>

      <div className="overlay">
        {list.map((cp, i) => {
          const goal = i === list.length - 1;
          const st = cpStatus(s, cp);
          const isCur = i === cur && !doneAll;
          const id = `cp:${cp.id}`;
          return (
            <div key={id}>
              <button
                type="button"
                ref={setEl(id, 'node')}
                className={`mnode ${st}${isCur ? ' cur' : ''}${goal ? ' goal' : ''}`}
                onClick={() => onCp(cp.id)}
                aria-label={`Checkpoint ${i + 1}: ${cp.title}`}
              >
                {st === 'done' && !isCur && <IconCheck size={9} />}
              </button>
              {goal && (
                <div ref={setEl(id, 'flag')} className="mflag" aria-hidden="true">
                  <svg width="40" height="54" viewBox="0 0 40 54">
                    <line x1="6" y1="52" x2="6" y2="4" stroke="#f4f9ff" strokeWidth="3" strokeLinecap="round" />
                    <path d="M7 5 C 15 1, 22 9, 36 5 L 29 14 L 36 24 C 22 28, 15 20, 7 24 Z" fill="#f4f9ff" />
                  </svg>
                </div>
              )}
              <button type="button" ref={setEl(id, 'label')} className={`mpill cp ${st}${isCur ? ' cur' : ''}${goal ? ' goal' : ''}`} onClick={() => onCp(cp.id)}>
                <span className="mpill-i">{cpIcon(s, cp, goal)}</span>
                <span className="mpill-t">{goal ? dest.goal : cp.title}</span>
              </button>
            </div>
          );
        })}
        {rp.pos > 0.05 && <span ref={setEl('start', 'node')} className="mnode start" aria-hidden="true" />}
        <button type="button" ref={setEl('you', 'node')} className="myou" onClick={onYou} aria-label="Sei qui: torna alla tua posizione">
          <i />
        </button>
        <button type="button" ref={setEl('you', 'label')} className="mpill you" onClick={onYou}>
          {doneAll ? 'Arrivato' : 'Sei qui'}
        </button>
        {zones.map((z) => {
          const zone = s.zones.find((x) => x.id === z.id);
          if (!zone) return null;
          const h = hits.get(z.id) ?? 0;
          return (
            <button type="button" key={z.id} ref={setEl(`zone:${z.id}`, 'label')} className="mpill zone" onClick={() => onZone(z.id)}>
              <span className="mpill-i">
                <IconWarn size={19} />
              </span>
              <span className="mpill-t">{zone.short ?? zone.name}</span>
              {h > 0 && <b className="mpill-n">{h}</b>}
            </button>
          );
        })}
      </div>
    </div>
  );
});

function nRefLast(r: { stops: unknown[] }): number {
  return r.stops.length - 1;
}
