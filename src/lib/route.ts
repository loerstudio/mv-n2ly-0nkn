import { rng } from './util';

export interface P {
  x: number;
  y: number;
}

/** the terrain is much larger than the route so the map never ends while you pan */
export const TERRAIN = { x0: -900, y0: -900, w: 2500, h: 2700 };

export interface Route {
  /** stops[0] = start, stops[1..n] = checkpoints (the last one carries the flag) */
  stops: P[];
  samples: P[];
  stopIdx: number[];
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** A sinuous route from the bottom-left to the top-right, Catmull-Rom through organically spaced stops. */
export function buildRoute(n: number): Route {
  const rand = rng(77);
  const a: P = { x: 120, y: 700 };
  const b: P = { x: 700, y: 90 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  const nx = -dy / L;
  const ny = dx / L;
  const stops: P[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t0 = i / n;
    const t = t0 + Math.sin(t0 * Math.PI * 2) * 0.018 + (i > 0 && i < n ? (rand() - 0.5) * 0.02 : 0);
    const amp = 66 * Math.pow(Math.sin(Math.PI * Math.min(Math.max(t, 0.02), 0.98)), 0.6) + 8;
    const off = amp * Math.sin(2 * Math.PI * 1.2 * t + 0.5);
    stops.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
  }
  const pad: P[] = [{ x: stops[0].x - 50, y: stops[0].y + 70 }, ...stops, { x: stops[n].x + 30, y: stops[n].y - 40 }];
  const samples: P[] = [];
  const stopIdx: number[] = [];
  const STEPS = 28;
  for (let i = 0; i < n; i += 1) {
    const [p0, p1, p2, p3] = [pad[i], pad[i + 1], pad[i + 2], pad[i + 3]];
    stopIdx.push(samples.length);
    for (let k = 0; k < STEPS; k += 1) {
      const t = k / STEPS;
      const t2 = t * t;
      const t3 = t2 * t;
      samples.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  stopIdx.push(samples.length);
  samples.push(stops[n]);
  const xs = samples.map((s) => s.x);
  const ys = samples.map((s) => s.y);
  return { stops, samples, stopIdx, bbox: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
}

export function pointAt(r: Route, pos: number): P & { a: number } {
  const n = r.stops.length - 1;
  const p = Math.min(Math.max(pos, 0), n);
  const i = Math.min(Math.floor(p), n - 1);
  const t = p - i;
  const f = r.stopIdx[i] + t * (r.stopIdx[i + 1] - r.stopIdx[i]);
  const i0 = Math.min(Math.floor(f), r.samples.length - 2);
  const u = f - i0;
  const a = r.samples[i0];
  const b = r.samples[i0 + 1];
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, a: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** polyline path between two positions along the route */
export function pathBetween(r: Route, from: number, to: number): string {
  const n = r.stops.length - 1;
  const fi = (p: number) => {
    const c = Math.min(Math.max(p, 0), n);
    const i = Math.min(Math.floor(c), n - 1);
    return r.stopIdx[i] + (c - i) * (r.stopIdx[i + 1] - r.stopIdx[i]);
  };
  const f0 = fi(from);
  const f1 = fi(to);
  if (f1 <= f0) return '';
  const a = pointAt(r, from);
  let d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}`;
  for (let i = Math.floor(f0) + 1; i <= Math.floor(f1); i += 1) {
    const q = r.samples[i];
    d += `L${q.x.toFixed(1)} ${q.y.toFixed(1)}`;
  }
  const b = pointAt(r, to);
  d += `L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  return d;
}

// ── risk territories ───────────────────────────────────────────────────────
export interface ZoneShape {
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  d: string;
}

function closedSmooth(pts: P[]): string {
  const n = pts.length;
  const mid = (p: P, q: P): P => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const m0 = mid(pts[n - 1], pts[0]);
  let d = `M${m0.x.toFixed(1)} ${m0.y.toFixed(1)}`;
  for (let i = 0; i < n; i += 1) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    d += `Q${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`;
  }
  return d + 'Z';
}

/** Irregular territories on both sides of the route, never on top of it or of each other. */
export function placeZones(r: Route, ids: string[]): ZoneShape[] {
  const rand = rng(1917);
  const placed: { cx: number; cy: number; rx: number; ry: number }[] = [];
  const n = ids.length;
  const out: ZoneShape[] = [];
  // spread along the route; alternate above-left / below-right
  ids.forEach((id, k) => {
    // the first territories sit where they read well on the overview; the rest are further out
    const spec: [number, number][] = [[0.5, -1], [0.27, -1], [0.55, 1], [0.15, 1], [0.86, -1]];
    const t = k < spec.length ? spec[k][0] : 0.08 + 0.86 * ((k * 0.618033) % 1);
    const p = pointAt(r, t * (r.stops.length - 1));
    const side = k < spec.length ? spec[k][1] : k % 2 === 0 ? -1 : 1;
    // right-hand normal of the direction of travel: lower-right of an up-right route
    const nx = -Math.sin(p.a);
    const ny = Math.cos(p.a);
    const rx = 92 + rand() * 38;
    const ry = 62 + rand() * 30;
    const far = k >= 5;
    let dist = far ? 300 : k === 0 ? 178 : 150;
    let cx = 0;
    let cy = 0;
    for (let it = 0; it < 60; it += 1) {
      cx = p.x + side * nx * dist;
      cy = p.y + side * ny * dist;
      const clash =
        r.samples.some((q) => ((q.x - cx) / (rx + 34)) ** 2 + ((q.y - cy) / (ry + 34)) ** 2 < 1) ||
        placed.some((z) => ((z.cx - cx) / (rx + z.rx + 14)) ** 2 + ((z.cy - cy) / (ry + z.ry + 14)) ** 2 < 1) ||
        (!far && (cx - rx < -40 || cx + rx > 860 || cy - ry < -10 || cy + ry > 820));
      if (!clash) break;
      dist += 12;
      if (dist > (far ? 520 : 340)) dist = far ? 300 : 120 + rand() * 40;
    }
    placed.push({ cx, cy, rx, ry });
    const m = 11;
    const pts: P[] = [];
    for (let i = 0; i < m; i += 1) {
      const a = (i / m) * Math.PI * 2;
      const wob = 0.86 + rand() * 0.28;
      pts.push({ x: cx + Math.cos(a) * rx * wob, y: cy + Math.sin(a) * ry * wob });
    }
    out.push({ id, cx, cy, rx, ry, d: closedSmooth(pts) });
  });
  void n;
  return out;
}

// ── terrain: hills, water, contours, faint roads ───────────────────────────
export interface Terrain {
  hills: { level: number; d: string }[];
  water: { level: number; d: string }[];
  lines: { major: boolean; d: string }[];
  roads: { major: boolean; d: string }[];
}

type Seg = [string, string, P, P];

function contour(grid: Float32Array, cols: number, rows: number, lvl: number, x0: number, y0: number, cell: number, close: boolean): string {
  const segs: Seg[] = [];
  const v = (i: number, j: number) => grid[j * cols + i];
  const lerp = (a: number, b: number) => (lvl - a) / (b - a || 1e-9);
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const tl = v(i, j);
      const tr = v(i + 1, j);
      const br = v(i + 1, j + 1);
      const bl = v(i, j + 1);
      const idx = (tl >= lvl ? 8 : 0) | (tr >= lvl ? 4 : 0) | (br >= lvl ? 2 : 0) | (bl >= lvl ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const X = x0 + i * cell;
      const Y = y0 + j * cell;
      const top = (): [string, P] => [`h${i},${j}`, { x: X + lerp(tl, tr) * cell, y: Y }];
      const right = (): [string, P] => [`v${i + 1},${j}`, { x: X + cell, y: Y + lerp(tr, br) * cell }];
      const bottom = (): [string, P] => [`h${i},${j + 1}`, { x: X + lerp(bl, br) * cell, y: Y + cell }];
      const left = (): [string, P] => [`v${i},${j}`, { x: X, y: Y + lerp(tl, bl) * cell }];
      const add = (p: [string, P], q: [string, P]) => segs.push([p[0], q[0], p[1], q[1]]);
      const centre = (tl + tr + br + bl) / 4 >= lvl;
      switch (idx) {
        case 1: case 14: add(left(), bottom()); break;
        case 2: case 13: add(bottom(), right()); break;
        case 3: case 12: add(left(), right()); break;
        case 4: case 11: add(top(), right()); break;
        case 6: case 9: add(top(), bottom()); break;
        case 7: case 8: add(left(), top()); break;
        case 5: if (centre) { add(left(), top()); add(bottom(), right()); } else { add(left(), bottom()); add(top(), right()); } break;
        case 10: if (centre) { add(left(), bottom()); add(top(), right()); } else { add(left(), top()); add(bottom(), right()); } break;
        default: break;
      }
    }
  }
  const byKey = new Map<string, number[]>();
  segs.forEach((s, k) => {
    for (const key of [s[0], s[1]]) {
      const l = byKey.get(key);
      if (l) l.push(k);
      else byKey.set(key, [k]);
    }
  });
  const used = new Uint8Array(segs.length);
  const next = (key: string, from: number): number => {
    const l = byKey.get(key);
    if (!l) return -1;
    for (const k of l) if (k !== from && !used[k]) return k;
    return -1;
  };
  let d = '';
  for (let k0 = 0; k0 < segs.length; k0 += 1) {
    if (used[k0]) continue;
    used[k0] = 1;
    const pts: P[] = [segs[k0][2], segs[k0][3]];
    let endKey = segs[k0][1];
    let from = k0;
    for (;;) {
      const k = next(endKey, from);
      if (k < 0) break;
      used[k] = 1;
      const s = segs[k];
      if (s[0] === endKey) { pts.push(s[3]); endKey = s[1]; } else { pts.push(s[2]); endKey = s[0]; }
      from = k;
    }
    let startKey = segs[k0][0];
    from = k0;
    for (;;) {
      const k = next(startKey, from);
      if (k < 0) break;
      used[k] = 1;
      const s = segs[k];
      if (s[1] === startKey) { pts.unshift(s[2]); startKey = s[0]; } else { pts.unshift(s[3]); startKey = s[1]; }
      from = k;
    }
    if (pts.length < 5) continue;
    d += `M${pts[0].x.toFixed(0)} ${pts[0].y.toFixed(0)}`;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      d += `Q${pts[i].x.toFixed(0)} ${pts[i].y.toFixed(0)} ${mx.toFixed(0)} ${my.toFixed(0)}`;
    }
    d += close ? 'Z' : `L${pts[pts.length - 1].x.toFixed(0)} ${pts[pts.length - 1].y.toFixed(0)}`;
  }
  return d;
}

let cached: Terrain | null = null;

export function buildTerrain(): Terrain {
  if (cached) return cached;
  const CELL = 26;
  const { x0, y0, w, h } = TERRAIN;
  const cols = Math.ceil(w / CELL) + 1;
  const rows = Math.ceil(h / CELL) + 1;
  const rand = rng(4242);
  const edge = (x: number, y: number) => {
    const d = Math.min(x - x0, x0 + w - x, y - y0, y0 + h - y);
    const t = Math.min(1, Math.max(0, d / 160));
    return t * t * (3 - 2 * t);
  };

  // hills: scattered soft peaks (deterministic)
  const peaks: { x: number; y: number; sx: number; sy: number; a: number }[] = [];
  const NP = 30;
  for (let i = 0; i < NP; i += 1) peaks.push({ x: x0 + 200 + rand() * (w - 400), y: y0 + 200 + rand() * (h - 400), sx: 90 + rand() * 120, sy: 80 + rand() * 105, a: 0.55 + rand() * 0.6 });
  const ph = [rand() * 6, rand() * 6, rand() * 6];
  const hillF = (x: number, y: number) => {
    let v = 0.1 * Math.sin(x / 190 + ph[0]) * Math.cos(y / 170 + ph[1]) + 0.07 * Math.sin((x - y) / 120 + ph[2]);
    for (const p of peaks) {
      const dx = (x - p.x) / p.sx;
      const dy = (y - p.y) / p.sy;
      v += p.a * Math.exp(-(dx * dx + dy * dy) / 2);
    }
    return v * edge(x, y);
  };

  // water: a few elongated lakes, lower-right heavy
  const lakes = [
    { x: 640, y: 770, sx: 230, sy: 120, r: 0.3 },
    { x: 1150, y: 520, sx: 130, sy: 190, r: -0.5 },
    { x: 800, y: 70, sx: 130, sy: 75, r: 0.2 },
    { x: -330, y: 180, sx: 170, sy: 100, r: 0.7 },
    { x: -250, y: 900, sx: 190, sy: 110, r: -0.3 },
    { x: 560, y: 1180, sx: 240, sy: 110, r: 0.1 },
    { x: 90, y: -420, sx: 200, sy: 100, r: -0.2 },
  ];
  const waterF = (x: number, y: number) => {
    let v = 0;
    for (const l of lakes) {
      const c = Math.cos(l.r);
      const s = Math.sin(l.r);
      const dx = ((x - l.x) * c + (y - l.y) * s) / l.sx;
      const dy = (-(x - l.x) * s + (y - l.y) * c) / l.sy;
      const wob = 1 + 0.18 * Math.sin(dx * 3.1 + dy * 2.3) + 0.12 * Math.sin(dy * 4.7 - dx * 1.9);
      v += Math.exp(-(dx * dx + dy * dy) * wob);
    }
    return v;
  };

  const gh = new Float32Array(cols * rows);
  const gw = new Float32Array(cols * rows);
  let hmax = 0;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = x0 + i * CELL;
      const y = y0 + j * CELL;
      const hv = hillF(x, y);
      gh[j * cols + i] = hv;
      gw[j * cols + i] = waterF(x, y) * edge(x, y) ;
      if (hv > hmax) hmax = hv;
    }
  }

  const hills = [0.52, 0.65, 0.78, 0.91, 1.04].map((lv, i) => ({ level: i, d: contour(gh, cols, rows, lv * 0.78, x0, y0, CELL, true) }));
  const water = [0.38, 0.62].map((lv, i) => ({ level: i, d: contour(gw, cols, rows, lv, x0, y0, CELL, true) }));
  const lines: Terrain['lines'] = [];
  for (let l = 1; l <= 14; l += 1) lines.push({ major: l % 4 === 0, d: contour(gh, cols, rows, (hmax * l) / 15, x0, y0, CELL, false) });
  for (let l = 1; l <= 3; l += 1) lines.push({ major: false, d: contour(gw, cols, rows, 0.38 - l * 0.085, x0, y0, CELL, false) });

  // faint roads
  const roads: Terrain['roads'] = [];
  for (let k = 0; k < 16; k += 1) {
    const pts: P[] = [];
    const sx = x0 + 200 + rand() * (w - 400);
    const sy = y0 + 200 + rand() * (h - 400);
    const ang = rand() * Math.PI * 2;
    const steps = 6 + Math.floor(rand() * 4);
    let a = ang;
    let x = sx;
    let y = sy;
    for (let i = 0; i < steps; i += 1) {
      pts.push({ x, y });
      a += (rand() - 0.5) * 1.1;
      const len = 130 + rand() * 120;
      x += Math.cos(a) * len;
      y += Math.sin(a) * len;
    }
    let d = `M${pts[0].x.toFixed(0)} ${pts[0].y.toFixed(0)}`;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      d += `Q${pts[i].x.toFixed(0)} ${pts[i].y.toFixed(0)} ${mx.toFixed(0)} ${my.toFixed(0)}`;
    }
    roads.push({ major: k % 5 === 0, d });
  }

  cached = { hills, water, lines, roads };
  return cached;
}
