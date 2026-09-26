/**
 * Hand-drawn ink for the explainer film.
 *
 * Everything on the canvas is drawn here: there are no image assets and no web
 * fonts, so the whole film is a few kilobytes of arithmetic. Two ideas carry the
 * look.
 *
 * 1. Every stroke is a polyline pushed off its true path by smooth noise, drawn
 *    twice at slightly different offsets. That is what a pen does when a hand
 *    goes over a line a second time.
 * 2. The noise is reseeded on a quantised clock (BOIL_FPS), not per frame. Drawn
 *    animation "boils" at the rate it was drawn at; reseeding at 60fps looks
 *    like television static instead.
 */

export type Pt = [number, number];

/** Frames per second the hand-drawn jitter is reseeded at. */
export const BOIL_FPS = 8;

export const PAPER = "#efe4cf";
export const INK = "#2a2320";
export const INK_SOFT = "#5c5149";
export const RED = "#c0392b";
export const GOLD = "#d99b1f";
export const FELT = "#1d6a52";
export const FELT_DARK = "#15503e";
export const CARD = "#fbf8f1";
export const BLUE = "#2d5f8a";

function hash2(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic 0..1 from a seed and an index. */
export function rand(seed: number, i: number): number {
  return hash2(seed, i) / 4294967296;
}

/** Deterministic -1..1. */
export function srand(seed: number, i: number): number {
  return rand(seed, i) * 2 - 1;
}

/**
 * The render clock. Every stroke mixes it into its seed, so the whole drawing
 * is redrawn by a slightly different hand a few times a second — the "boil" of
 * frame-by-frame animation. It is quantised: reseeding at the display's frame
 * rate looks like static, not like a pen.
 *
 * It is module state because it belongs to the renderer, not to any drawing:
 * threading a clock through every prop would say nothing about the picture.
 */
let inkClock = 0;
let boilRate = BOIL_FPS;

export function setInkClock(t: number): void {
  inkClock = t;
}

/** 0 freezes the line work, which is what reduced-motion asks for. */
export function setBoilRate(fps: number): void {
  boilRate = Math.max(0, fps);
}

/** A seed that only changes `boilRate` times a second. */
export function boil(seed: number): number {
  if (boilRate <= 0) return hash2(seed, 1);
  return hash2(seed, Math.floor(inkClock * boilRate) + 2);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export function easeOut(u: number): number {
  const c = clamp(u, 0, 1);
  return 1 - (1 - c) * (1 - c) * (1 - c);
}

export function easeIn(u: number): number {
  const c = clamp(u, 0, 1);
  return c * c * c;
}

export function easeInOut(u: number): number {
  const c = clamp(u, 0, 1);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** Overshoots past 1 and settles, for things that land on the paper. */
export function pop(u: number): number {
  const c = clamp(u, 0, 1);
  if (c >= 1) return 1;
  const p = 1 - Math.pow(2, -9 * c);
  return p + Math.sin(c * Math.PI * 2.4) * (1 - c) * 0.16;
}

/** Local progress of item `i` of `n` inside a window, each starting `gap` later. */
export function stagger(i: number, n: number, u: number, gap = 0.06): number {
  const start = n > 1 ? i * gap : 0;
  const span = Math.max(0.0001, 1 - (n - 1) * gap);
  return clamp((u - start) / span, 0, 1);
}

/** 0 while below `a`, 1 above `b`, smooth between. */
export function ramp(v: number, a: number, b: number): number {
  if (b === a) return v >= b ? 1 : 0;
  return easeInOut(clamp((v - a) / (b - a), 0, 1));
}

/** Rises then falls: 0 at the edges of [a,d], 1 across [b,c]. */
export function window4(v: number, a: number, b: number, c: number, d: number): number {
  if (v <= a || v >= d) return 0;
  if (v < b) return ramp(v, a, b);
  if (v > c) return 1 - ramp(v, c, d);
  return 1;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Resample a polyline so wobble is applied at an even spatial rate. */
export function resample(pts: Pt[], step = 14): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(d / step));
    for (let k = 1; k <= n; k++) out.push([lerp(x0, x1, k / n), lerp(y0, y1, k / n)]);
  }
  return out;
}

/**
 * Push a polyline off its path by smooth noise, perpendicular to the local
 * direction. Two sine waves at unrelated frequencies read as a hand, where a
 * single one reads as a spring.
 */
export function wobble(pts: Pt[], seed: number, amp = 1.6, closed = false): Pt[] {
  const n = pts.length;
  if (n < 2) return pts.slice();
  const p1 = rand(seed, 7) * 6.283;
  const p2 = rand(seed, 11) * 6.283;
  const f1 = 0.35 + rand(seed, 13) * 0.25;
  const f2 = 0.11 + rand(seed, 17) * 0.09;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[i === 0 ? (closed ? n - 1 : 0) : i - 1];
    const next = pts[i === n - 1 ? (closed ? 0 : n - 1) : i + 1];
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    // Ends of an open line are anchored: a hand starts and stops on the mark.
    const hold = closed ? 1 : Math.min(1, Math.min(i, n - 1 - i) / 2 + 0.35);
    const w = (Math.sin(i * f1 + p1) * 0.62 + Math.sin(i * f2 + p2) * 0.48) * amp * hold;
    out.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
  }
  return out;
}

function traceSmooth(ctx: CanvasRenderingContext2D, pts: Pt[], closed: boolean): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) {
    ctx.lineTo(pts[1][0], pts[1][1]);
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y] = pts[i];
      const [nx, ny] = pts[i + 1];
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last[0], last[1]);
  }
  if (closed) ctx.closePath();
}

export interface StrokeOpts {
  color?: string;
  width?: number;
  /** How far the pen strays from the true path, in pixels. */
  amp?: number;
  /** Overdrawn passes. 2 is the pen-gone-over-twice look. */
  passes?: number;
  alpha?: number;
  closed?: boolean;
  /** Draw only the first `progress` of the path, for lines that write on. */
  progress?: number;
  dash?: number[];
}

/** Draw a wobbled, overdrawn polyline. */
export function stroke(ctx: CanvasRenderingContext2D, raw: Pt[], seed: number, opts: StrokeOpts = {}): void {
  const progress = opts.progress === undefined ? 1 : clamp(opts.progress, 0, 1);
  if (progress <= 0 || raw.length < 2) return;
  let pts = resample(raw, 13);
  if (progress < 1) {
    const keep = Math.max(2, Math.round(pts.length * progress));
    pts = pts.slice(0, keep);
  }
  const closed = !!opts.closed && progress >= 1;
  const base = boil(seed);
  const ambient = ctx.globalAlpha;
  const passes = opts.passes === undefined ? 2 : opts.passes;
  const amp = opts.amp === undefined ? 1.6 : opts.amp;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = opts.color || INK;
  if (opts.dash) ctx.setLineDash(opts.dash);
  for (let p = 0; p < passes; p++) {
    const s = hash2(base, 101 + p * 37);
    ctx.globalAlpha *= ambient * (opts.alpha === undefined ? 1 : opts.alpha) * (p === 0 ? 1 : 0.55);
    ctx.lineWidth = (opts.width === undefined ? 2.4 : opts.width) * (p === 0 ? 1 : 0.8);
    const jx = srand(s, 3) * 0.9;
    const jy = srand(s, 5) * 0.9;
    ctx.save();
    ctx.translate(jx, jy);
    traceSmooth(ctx, wobble(pts, s, amp, closed), closed);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** Fill a wobbled shape, deliberately a shade off register like cut paper. */
export function fill(
  ctx: CanvasRenderingContext2D,
  raw: Pt[],
  seed: number,
  color: string,
  opts: { amp?: number; alpha?: number; offset?: number } = {},
): void {
  if (raw.length < 3) return;
  const s = hash2(boil(seed), 211);
  const off = opts.offset === undefined ? 1.4 : opts.offset;
  ctx.save();
  ctx.globalAlpha *= (opts.alpha === undefined ? 1 : opts.alpha);
  ctx.fillStyle = color;
  ctx.translate(srand(s, 2) * off, srand(s, 4) * off);
  traceSmooth(ctx, wobble(resample(raw, 16), s, opts.amp === undefined ? 1.8 : opts.amp, true), true);
  ctx.fill();
  ctx.restore();
}

/** Pencil hatching inside a shape, for shadow without a gradient. */
export function hatch(
  ctx: CanvasRenderingContext2D,
  raw: Pt[],
  seed: number,
  opts: { color?: string; spacing?: number; angle?: number; alpha?: number; width?: number } = {},
): void {
  if (raw.length < 3) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of raw) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const hs = boil(seed);
  const spacing = opts.spacing === undefined ? 9 : opts.spacing;
  const angle = opts.angle === undefined ? -0.6 : opts.angle;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const reach = Math.hypot(maxX - minX, maxY - minY) / 2 + spacing;
  ctx.save();
  traceSmooth(ctx, raw, true);
  ctx.clip();
  ctx.strokeStyle = opts.color || INK;
  ctx.globalAlpha *= (opts.alpha === undefined ? 0.2 : opts.alpha);
  ctx.lineWidth = opts.width === undefined ? 1.6 : opts.width;
  ctx.lineCap = "round";
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let i = 0;
  for (let d = -reach; d <= reach; d += spacing) {
    const bx = cx - dy * d;
    const by = cy + dx * d;
    const jitter = srand(hs, 300 + i) * 2;
    traceSmooth(
      ctx,
      wobble(
        resample(
          [
            [bx - dx * reach, by - dy * reach + jitter],
            [bx + dx * reach, by + dy * reach - jitter],
          ],
          18,
        ),
        hash2(hs, 400 + i),
        1.4,
      ),
      false,
    );
    ctx.stroke();
    i++;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Shape builders
// ---------------------------------------------------------------------------

export function rectPts(x: number, y: number, w: number, h: number): Pt[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

export function ellipsePts(cx: number, cy: number, rx: number, ry: number, steps = 28): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** A rectangle with torn paper edges — the collage workhorse. */
export function tornPts(x: number, y: number, w: number, h: number, seed: number, amp = 5): Pt[] {
  const out: Pt[] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number, k: number): void => {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(3, Math.round(d / 26));
    let dx = (y1 - y0) / d;
    let dy = -(x1 - x0) / d;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const bump = srand(hash2(seed, k * 97 + i), 9) * amp;
      const taper = Math.sin(u * Math.PI) * 0.6 + 0.4;
      out.push([lerp(x0, x1, u) + dx * bump * taper, lerp(y0, y1, u) + dy * bump * taper]);
    }
  };
  edge(x, y, x + w, y, 1);
  edge(x + w, y, x + w, y + h, 2);
  edge(x + w, y + h, x, y + h, 3);
  edge(x, y + h, x, y, 4);
  return out;
}

/** A torn scrap of paper: soft shadow, fill, and a drawn edge. */
export function scrap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  opts: { color?: string; angle?: number; edge?: string; amp?: number; alpha?: number; shadow?: boolean } = {},
): void {
  const pts = tornPts(x, y, w, h, seed, opts.amp === undefined ? 5 : opts.amp);
  ctx.save();
  if (opts.angle) {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(opts.angle);
    ctx.translate(-(x + w / 2), -(y + h / 2));
  }
  ctx.globalAlpha *= opts.alpha === undefined ? 1 : opts.alpha;
  if (opts.shadow !== false) {
    ctx.save();
    ctx.translate(4, 6);
    ctx.globalAlpha *= 0.16;
    ctx.fillStyle = "#3a2f28";
    traceSmooth(ctx, pts, true);
    ctx.fill();
    ctx.restore();
  }
  fill(ctx, pts, seed, opts.color || CARD, { offset: 0.8 });
  if (opts.edge !== "none") stroke(ctx, pts, hash2(seed, 5), { color: opts.edge || INK_SOFT, width: 1.6, closed: true, alpha: 0.7, passes: 1 });
  ctx.restore();
}

/** A strip of masking tape, for pinning a scrap down. */
export function tape(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  len: number,
  angle: number,
  seed: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const pts = tornPts(-len / 2, -9, len, 18, seed, 2.4);
  fill(ctx, pts, seed, "#e8d9a8", { alpha: 0.72, offset: 0.4 });
  stroke(ctx, pts, hash2(seed, 3), { color: "#b9a672", width: 1, alpha: 0.5, closed: true, passes: 1 });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Hand-lettered stroke font
// ---------------------------------------------------------------------------

/** Glyphs are polylines in a 6-wide, 10-tall box with the baseline at y=10. */
const GLYPHS: Record<string, Pt[][]> = {
  A: [[[0, 10], [3, 0], [6, 10]], [[1.1, 6.6], [5, 6.4]]],
  B: [[[0.2, 0], [0, 10]], [[0.2, 0], [4, 0.5], [5.2, 2.2], [4, 4.8], [0.1, 5]], [[0.1, 5], [4.6, 5.3], [6, 7.3], [4.4, 9.7], [0, 10]]],
  C: [[[6, 1.6], [4, 0], [1.4, 0.7], [0, 4.2], [0.5, 8], [2.6, 10], [5.7, 8.9]]],
  D: [[[0.2, 0], [0, 10]], [[0.2, 0], [4.2, 0.7], [6, 4.2], [4.9, 8.7], [0, 10]]],
  E: [[[6, 0.1], [0.1, 0.4], [0, 10], [5.9, 9.5]], [[0.05, 5.1], [4.7, 4.8]]],
  F: [[[6, 0], [0.2, 0.4], [0, 10]], [[0.1, 5], [4.5, 4.7]]],
  G: [[[6, 1.6], [4, 0], [1.3, 0.9], [0, 4.6], [0.9, 8.7], [3.6, 10], [6, 8.4], [6, 5.7], [3.7, 5.5]]],
  H: [[[0.2, 0], [0, 10]], [[6, 0.1], [5.8, 10]], [[0.1, 5.1], [5.9, 4.8]]],
  I: [[[1, 0.1], [5, 0.3]], [[3.1, 0.2], [2.9, 9.8]], [[1, 10], [5, 9.7]]],
  J: [[[1.4, 0], [5.6, 0.3]], [[4.1, 0.3], [3.9, 7.7], [2.5, 10], [0.3, 8.5]]],
  K: [[[0.2, 0], [0, 10]], [[5.7, 0], [0.4, 5.5]], [[1.8, 4.1], [6, 10]]],
  L: [[[0.4, 0], [0, 10], [5.8, 9.4]]],
  M: [[[0, 10], [0.7, 0], [3, 6.1], [5.3, 0], [6, 10]]],
  N: [[[0, 10], [0.4, 0], [5.6, 10], [6, 0.2]]],
  O: [[[3, 0], [0.6, 2.1], [0, 5.6], [1.4, 9.1], [4.1, 10], [6, 7.4], [5.7, 3], [3, 0]]],
  P: [[[0.2, 10], [0.4, 0], [4.4, 0.6], [5.7, 2.7], [4.1, 5.4], [0.3, 5.7]]],
  Q: [[[3, 0], [0.6, 2.1], [0, 5.6], [1.4, 9.1], [4.1, 10], [6, 7.4], [5.7, 3], [3, 0]], [[3.9, 7.5], [6.4, 10.8]]],
  R: [[[0.2, 10], [0.4, 0], [4.4, 0.6], [5.7, 2.7], [4.1, 5.3], [0.3, 5.6]], [[2.7, 5.4], [6, 10]]],
  S: [[[5.8, 1.5], [3.4, 0], [0.8, 1.3], [1.5, 4.1], [4.6, 5.4], [5.8, 7.7], [4, 9.9], [0.5, 8.9]]],
  T: [[[0, 0.4], [6, 0]], [[3.1, 0.2], [2.9, 10]]],
  U: [[[0.1, 0], [0.3, 7.4], [2.7, 10], [5.4, 9.3], [6, 0.3]]],
  V: [[[0, 0], [3, 10], [6, 0.3]]],
  W: [[[0, 0], [1.4, 10], [3, 3.7], [4.6, 10], [6, 0.4]]],
  X: [[[0.1, 0], [6, 10]], [[6, 0.3], [0, 9.8]]],
  Y: [[[0, 0], [3, 5.3], [6, 0.3]], [[3, 5.3], [2.9, 10]]],
  Z: [[[0, 0.4], [6, 0]], [[6, 0], [0.2, 9.8]], [[0.2, 9.8], [6, 10]]],
  "0": [[[3, 0], [0.6, 2.1], [0, 5.6], [1.4, 9.1], [4.1, 10], [6, 7.4], [5.7, 3], [3, 0]], [[1.3, 8.3], [4.8, 1.8]]],
  "1": [[[0.9, 2.1], [3.1, 0.2], [2.9, 10]], [[1.1, 10], [5, 9.7]]],
  "2": [[[0.4, 1.9], [2.7, 0], [5.4, 1.5], [4.6, 4.7], [0.2, 9.8], [6, 9.5]]],
  "3": [[[0.6, 0.7], [4, 0], [5.4, 2.4], [2.9, 4.8]], [[2.9, 4.8], [5.8, 6.6], [4.6, 9.8], [0.6, 9.3]]],
  "4": [[[4.5, 0], [0, 7], [6, 6.6]], [[4.5, 3.4], [4.6, 10]]],
  "5": [[[5.8, 0.4], [0.9, 0], [0.4, 4.5], [3.5, 4.1], [5.8, 6.1], [4.5, 9.7], [0.5, 9.1]]],
  "6": [[[5.4, 0.6], [2, 1.1], [0.2, 5], [0.7, 9], [3.5, 10], [5.7, 7.9], [4.6, 5.4], [1.4, 5.2], [0.3, 6.5]]],
  "7": [[[0, 0.5], [6, 0], [2.4, 10]], [[1.4, 5.4], [4.5, 5]]],
  "8": [[[3.4, 0], [0.8, 1.7], [1.7, 4.4], [4.7, 5.6], [5.6, 8.1], [3.3, 10], [1, 8.5], [1.7, 5.8], [4.8, 4.3], [5.4, 1.8], [3.4, 0]]],
  "9": [[[5.2, 4.7], [2.6, 5.7], [0.6, 4], [1.2, 1.2], [4, 0.2], [5.6, 2.7], [5.3, 7.1], [3.5, 10], [1, 9.5]]],
  ".": [[[2.6, 9.4], [3.3, 10]]],
  ",": [[[3.2, 8.9], [2.1, 11.4]]],
  "!": [[[3.1, 0], [2.8, 7]], [[2.8, 9.3], [3.2, 10]]],
  "?": [[[0.8, 1.7], [3, 0], [5.4, 1.9], [3.4, 4.7], [3, 6.5]], [[3, 9.3], [3.3, 10]]],
  ":": [[[2.8, 3.2], [3.3, 3.7]], [[2.8, 8.1], [3.3, 8.6]]],
  "-": [[[0.6, 5.4], [5.4, 5]]],
  "+": [[[3.1, 1.6], [2.9, 8.4]], [[0.4, 5.2], [5.6, 4.9]]],
  "=": [[[0.6, 3.6], [5.4, 3.3]], [[0.6, 6.8], [5.4, 6.5]]],
  "×": [[[1, 2.6], [5, 7.6]], [[5, 2.6], [1, 7.7]]],
  "'": [[[3.1, 0], [2.6, 2.5]]],
  "(": [[[4.4, 0], [1.4, 4], [1.6, 6.5], [4.6, 10]]],
  ")": [[[1.6, 0], [4.6, 4], [4.4, 6.5], [1.4, 10]]],
  "/": [[[5.4, 0], [0.6, 10]]],
  "<": [[[5.4, 1.2], [0.6, 5.2], [5.4, 9.2]]],
  ">": [[[0.6, 1.2], [5.4, 5.2], [0.6, 9.2]]],
  "→": [[[0, 5], [6, 5]], [[3.6, 2.6], [6, 5], [3.6, 7.4]]],
  "·": [[[2.7, 5], [3.3, 5.5]]],
};

const GLYPH_W = 6;
const GLYPH_H = 10;
const ADVANCE = 7.6;
const SPACE_ADVANCE = 4.4;

export function inkTextWidth(text: string, size: number, tracking = 0): number {
  const unit = size / GLYPH_H;
  let w = 0;
  for (const ch of text.toUpperCase()) {
    w += (ch === " " ? SPACE_ADVANCE : ADVANCE) * unit + tracking;
  }
  return Math.max(0, w - tracking);
}

export interface TextOpts {
  color?: string;
  width?: number;
  align?: "left" | "center" | "right";
  tracking?: number;
  /** Fraction of the letters drawn, so a word can write itself on. */
  progress?: number;
  amp?: number;
  alpha?: number;
  /** Per-letter rotation in radians; 0 is a steady hand. */
  jitter?: number;
  passes?: number;
}

/** Hand-letter a string. The font is strokes, so it wobbles like everything else. */
export function inkText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  seed: number,
  opts: TextOpts = {},
): void {
  const chars = text.toUpperCase().split("");
  const unit = size / GLYPH_H;
  const tracking = opts.tracking === undefined ? size * 0.06 : opts.tracking;
  const total = inkTextWidth(text, size, tracking);
  const align = opts.align || "left";
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  const progress = opts.progress === undefined ? 1 : clamp(opts.progress, 0, 1);
  const shown = progress * chars.length;
  const jitter = opts.jitter === undefined ? 0.035 : opts.jitter;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const reveal = clamp(shown - i, 0, 1);
    if (reveal <= 0) break;
    const glyph = GLYPHS[ch];
    const advance = (ch === " " ? SPACE_ADVANCE : ADVANCE) * unit + tracking;
    if (glyph) {
      const gs = hash2(seed, i * 31 + 3);
      const rot = srand(gs, 1) * jitter;
      const bob = srand(gs, 2) * size * 0.035;
      ctx.save();
      ctx.translate(cx + (GLYPH_W * unit) / 2, y + bob);
      ctx.rotate(rot);
      ctx.translate(-(GLYPH_W * unit) / 2, 0);
      for (const poly of glyph) {
        const pts: Pt[] = poly.map((p) => [p[0] * unit, (p[1] - GLYPH_H) * unit] as Pt);
        stroke(ctx, pts, hash2(gs, 17), {
          color: opts.color || INK,
          width: opts.width === undefined ? Math.max(1.4, size * 0.09) : opts.width,
          amp: opts.amp === undefined ? Math.max(0.5, size * 0.022) : opts.amp,
          alpha: opts.alpha,
          progress: reveal,
          passes: opts.passes,
        });
      }
      ctx.restore();
    }
    cx += advance;
  }
}

// ---------------------------------------------------------------------------
// Suits and cards
// ---------------------------------------------------------------------------

/** Diamonds, Clubs, Hearts, Spades — the Big Two order, lowest first. */
export const SUIT_ORDER = ["D", "C", "H", "S"] as const;
export type SuitKey = (typeof SUIT_ORDER)[number];

export function suitColor(suit: SuitKey): string {
  return suit === "D" || suit === "H" ? RED : INK;
}

function heartPts(size: number, steps = 30): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.pow(Math.sin(a), 3) * 16;
    const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
    out.push([(x / 17) * size * 0.5, (y / 17) * size * 0.5]);
  }
  return out;
}

/** Suit glyphs are paths, not text, so each one is drawn by the same pen. */
export function drawSuit(
  ctx: CanvasRenderingContext2D,
  suit: SuitKey,
  cx: number,
  cy: number,
  size: number,
  seed: number,
  opts: { color?: string; alpha?: number; outline?: boolean } = {},
): void {
  const color = opts.color || suitColor(suit);
  const alpha = opts.alpha === undefined ? 1 : opts.alpha;
  const r = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalAlpha *= alpha;
  const paint = (pts: Pt[], s: number): void => {
    fill(ctx, pts, s, color, { offset: size * 0.02, amp: size * 0.035 });
    if (opts.outline !== false) {
      stroke(ctx, pts, hash2(s, 9), { color, width: Math.max(1, size * 0.05), closed: true, passes: 1, amp: size * 0.03, alpha: 0.85 });
    }
  };
  if (suit === "D") {
    paint(
      [
        [0, -r],
        [r * 0.62, -r * 0.08],
        [r * 0.7, 0],
        [r * 0.62, r * 0.08],
        [0, r],
        [-r * 0.62, r * 0.08],
        [-r * 0.7, 0],
        [-r * 0.62, -r * 0.08],
      ],
      seed,
    );
  } else if (suit === "H") {
    paint(heartPts(size), seed);
  } else if (suit === "S") {
    const h = heartPts(size * 0.98).map((p) => [p[0], -p[1] * 0.95] as Pt);
    paint(h, seed);
    paint(
      [
        [-r * 0.08, r * 0.12],
        [r * 0.08, r * 0.12],
        [r * 0.32, r * 0.98],
        [-r * 0.32, r * 0.98],
      ],
      hash2(seed, 21),
    );
  } else {
    const lobe = r * 0.46;
    paint(ellipsePts(0, -r * 0.42, lobe, lobe, 18), hash2(seed, 1));
    paint(ellipsePts(-r * 0.5, r * 0.2, lobe, lobe, 18), hash2(seed, 2));
    paint(ellipsePts(r * 0.5, r * 0.2, lobe, lobe, 18), hash2(seed, 3));
    paint(
      [
        [-r * 0.07, r * 0.1],
        [r * 0.07, r * 0.1],
        [r * 0.34, r],
        [-r * 0.34, r],
      ],
      hash2(seed, 4),
    );
  }
  ctx.restore();
}
