import { rng } from './util';

export interface P {
  x: number;
  y: number;
}

export const WORLD_W = 1200;
const GAP = 300;
const MARGIN = 440;

export interface Route {
  W: number;
  H: number;
  /** stops[0] = start, stops[1..n] = checkpoints (last = destination flag) */
  stops: P[];
  samples: P[];
  /** index in `samples` where each stop sits */
  stopIdx: number[];
}

/** Catmull-Rom through the stops, sampled finely (also used for distances and "you are here"). */
export function buildRoute(n: number): Route {
  const H = MARGIN * 2 + GAP * n;
  const stops: P[] = [];
  for (let i = 0; i <= n; i += 1) {
    const amp = i === 0 ? 70 : 175;
    stops.push({ x: WORLD_W / 2 + Math.sin(i * 1.15 + 0.7) * amp, y: H - MARGIN - i * GAP });
  }
  const pad: P[] = [{ x: stops[0].x - 30, y: stops[0].y + 160 }, ...stops, { x: stops[n].x + 20, y: stops[n].y - 160 }];
  const samples: P[] = [];
  const stopIdx: number[] = [];
  const STEPS = 36;
  for (let i = 0; i < n; i += 1) {
    const p0 = pad[i];
    const p1 = pad[i + 1];
    const p2 = pad[i + 2];
    const p3 = pad[i + 3];
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
  return { W: WORLD_W, H, stops, samples, stopIdx };
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

// ── risk zones ──────────────────────────────────────────────────────────────
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
  const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  let d = `M${mid(pts[n - 1], pts[0]).x.toFixed(1)} ${mid(pts[n - 1], pts[0]).y.toFixed(1)}`;
  for (let i = 0; i < n; i += 1) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    d += `Q${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`;
  }
  return d + 'Z';
}

export function placeZones(r: Route, ids: string[]): ZoneShape[] {
  const n = r.stops.length - 1;
  const rand = rng(1917);
  // the checkpoint labels sit on alternating sides of the route: keep the zones clear of them
  const labels = r.stops.slice(1).map((p, i) => ({ x: p.x + (i % 2 === 0 ? 1 : -1) * 175, y: p.y, side: i % 2 === 0 ? 1 : -1 }));
  const placed: { cx: number; cy: number; rx: number; ry: number }[] = [];
  return ids.map((id, k) => {
    const u = ((k + 0.5) * n) / ids.length;
    const p = pointAt(r, Math.min(u, n - 0.2));
    const near = Math.min(n, Math.max(1, Math.round(u)));
    const side = -labels[near - 1].side;
    const rx = 112 + rand() * 38;
    const ry = 84 + rand() * 34;
    let cx = p.x + side * (rx + 90);
    const cy = p.y + (rand() - 0.5) * 60;
    for (let it = 0; it < 40; it += 1) {
      const clash =
        r.samples.some((q) => ((q.x - cx) / (rx + 46)) ** 2 + ((q.y - cy) / (ry + 46)) ** 2 < 1) ||
        labels.some((l) => ((l.x - cx) / (rx + 150)) ** 2 + ((l.y - cy) / (ry + 44)) ** 2 < 1) ||
        placed.some((z) => ((z.cx - cx) / (rx + z.rx + 20)) ** 2 + ((z.cy - cy) / (ry + z.ry + 20)) ** 2 < 1);
      if (!clash) break;
      cx += side * 16;
    }
    placed.push({ cx, cy, rx, ry });
    const pts: P[] = [];
    const m = 11;
    for (let i = 0; i < m; i += 1) {
      const t = (i / m) * Math.PI * 2;
      const wob = 0.86 + rand() * 0.28;
      pts.push({ x: cx + Math.cos(t) * rx * wob, y: cy + Math.sin(t) * ry * wob });
    }
    return { id, cx, cy, rx, ry, d: closedSmooth(pts) };
  });
}

// ── topographic contours (abstract, no realistic mountains) ────────────────
export interface Contour {
  idx: number;
  major: boolean;
  d: string;
}

export const TOPO_X0 = -900;
export const TOPO_W = 3000;

export function buildContours(H: number): Contour[] {
  const CELL = 34;
  const x0 = TOPO_X0;
  const y0 = -200;
  const cols = Math.ceil(TOPO_W / CELL) + 1;
  const rows = Math.ceil((H + 400) / CELL) + 1;
  const rand = rng(404);
  const blobs: { x: number; y: number; s: number; a: number }[] = [];
  const nb = Math.round(((H + 400) * TOPO_W) / 520000);
  for (let i = 0; i < nb; i += 1) blobs.push({ x: x0 + rand() * TOPO_W, y: y0 + rand() * (H + 400), s: 180 + rand() * 260, a: 0.55 + rand() * 0.8 });
  const ph = [rand() * 6, rand() * 6, rand() * 6];
  const field = (x: number, y: number) => {
    let v = 0.32 * Math.sin(x / 330 + ph[0]) * Math.cos(y / 290 + ph[1]) + 0.2 * Math.sin((x + y) / 210 + ph[2]);
    for (const b of blobs) {
      const dx = x - b.x;
      const dy = y - b.y;
      v += b.a * Math.exp(-(dx * dx + dy * dy) / (2 * b.s * b.s));
    }
    return v;
  };
  const grid = new Float32Array(cols * rows);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const v = field(x0 + i * CELL, y0 + j * CELL);
      grid[j * cols + i] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const out: Contour[] = [];
  const LEVELS = 13;
  for (let l = 1; l <= LEVELS; l += 1) {
    const lvl = min + ((max - min) * l) / (LEVELS + 1);
    out.push({ idx: l, major: l % 4 === 0, d: contourPath(grid, cols, rows, lvl, x0, y0, CELL) });
  }
  return out;
}

// marching squares with edge-key stitching into smooth polylines
function contourPath(grid: Float32Array, cols: number, rows: number, lvl: number, x0: number, y0: number, cell: number): string {
  type Seg = [string, string, P, P];
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
      const add = (a: [string, P], b: [string, P]) => segs.push([a[0], b[0], a[1], b[1]]);
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
  let d = '';
  const next = (key: string, from: number): number => {
    const l = byKey.get(key);
    if (!l) return -1;
    for (const k of l) if (k !== from && !used[k]) return k;
    return -1;
  };
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
    if (pts.length < 4) continue;
    d += `M${pts[0].x.toFixed(0)} ${pts[0].y.toFixed(0)}`;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      d += `Q${pts[i].x.toFixed(0)} ${pts[i].y.toFixed(0)} ${mx.toFixed(0)} ${my.toFixed(0)}`;
    }
    const last = pts[pts.length - 1];
    d += `L${last.x.toFixed(0)} ${last.y.toFixed(0)}`;
  }
  return d;
}
