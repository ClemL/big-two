/**
 * Stage props for the explainer film: cards, hands, the felt, the kit people
 * play on, and the marks a hand makes over the top of a drawing (arrows,
 * scribbled circles, ticks, stamps).
 *
 * Props take a seed and a time so they boil in place; nothing here holds state.
 */

import {
  BLUE,
  CARD,
  FELT,
  FELT_DARK,
  GOLD,
  INK,
  INK_SOFT,
  PAPER,
  RED,
  clamp,
  drawSuit,
  easeOut,
  ellipsePts,
  fill,
  hatch,
  inkText,
  inkTextWidth,
  lerp,
  rand,
  rectPts,
  srand,
  stroke,
  suitColor,
  tornPts,
  type Pt,
  type SuitKey,
} from "./ink.ts";

export interface CardArt {
  rank: string;
  suit: SuitKey;
}

export interface CardOpts {
  angle?: number;
  /** 0 = flat on the paper, higher lifts the shadow away. */
  lift?: number;
  alpha?: number;
  /** Greyed out, the way an unplayable card is on the real table. */
  dim?: boolean;
  faceDown?: boolean;
  /** Draws a ring of attention round the card. */
  ring?: string;
  scale?: number;
}

/** One card, cut from paper and drawn on. */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  art: CardArt | null,
  seed: number,
  opts: CardOpts = {},
): void {
  const s = opts.scale === undefined ? 1 : opts.scale;
  const cw = w * s;
  const ch = h * s;
  const alpha = (opts.alpha === undefined ? 1 : opts.alpha) * (opts.dim ? 0.55 : 1);
  if (alpha <= 0.01) return;
  const pts = tornPts(-cw / 2, -ch / 2, cw, ch, seed, Math.max(1.2, cw * 0.022));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(opts.angle || 0);
  ctx.globalAlpha *= alpha;

  const lift = opts.lift === undefined ? 2 : opts.lift;
  ctx.save();
  ctx.globalAlpha *= 0.18;
  ctx.fillStyle = "#3a2f28";
  ctx.translate(lift * 0.7 + 1.5, lift + 2.5);
  fill(ctx, pts, seed + 1, "#3a2f28", { offset: 0 });
  ctx.restore();

  if (opts.faceDown) {
    fill(ctx, pts, seed, BLUE, { offset: 0.6 });
    const inner = rectPts(-cw / 2 + cw * 0.12, -ch / 2 + ch * 0.1, cw * 0.76, ch * 0.8);
    // A crosshatched back below about 34px stops reading as a card and starts
    // reading as fabric, which is what a fanned hand of them looked like.
    if (cw >= 34) {
      hatch(ctx, inner, seed + 3, { color: PAPER, spacing: Math.max(5, cw * 0.14), angle: -0.7, alpha: 0.5, width: 1.4 });
      hatch(ctx, inner, seed + 4, { color: PAPER, spacing: Math.max(5, cw * 0.14), angle: 0.7, alpha: 0.5, width: 1.4 });
    } else {
      stroke(ctx, inner, seed + 3, { color: PAPER, width: 1.2, closed: true, passes: 1, alpha: 0.45 });
    }
    stroke(ctx, pts, seed + 5, { color: "#1b3f5c", width: 1.6, closed: true, passes: 1 });
    ctx.restore();
    return;
  }

  fill(ctx, pts, seed, opts.dim ? "#e7e1d4" : CARD, { offset: 0.7 });
  stroke(ctx, pts, seed + 5, { color: INK_SOFT, width: Math.max(1.2, cw * 0.02), closed: true, alpha: 0.75, passes: 1 });

  if (art) {
    const tone = opts.dim ? INK_SOFT : suitColor(art.suit);
    const rankSize = ch * 0.2;
    inkText(ctx, art.rank, -cw / 2 + cw * 0.12, -ch / 2 + ch * 0.1 + rankSize, rankSize, seed + 7, {
      color: tone,
      width: Math.max(1.3, ch * 0.019),
      jitter: 0.05,
    });
    drawSuit(ctx, art.suit, -cw / 2 + cw * 0.17, -ch / 2 + ch * 0.36, ch * 0.11, seed + 9, { color: tone });
    drawSuit(ctx, art.suit, cw * 0.04, ch * 0.06, ch * 0.4, seed + 11, { color: tone, alpha: 0.95 });
    ctx.save();
    ctx.rotate(Math.PI);
    inkText(ctx, art.rank, -cw / 2 + cw * 0.12, -ch / 2 + ch * 0.1 + rankSize, rankSize * 0.85, seed + 13, {
      color: tone,
      width: Math.max(1.1, ch * 0.016),
      alpha: 0.8,
      jitter: 0.05,
    });
    ctx.restore();
  }

  if (opts.ring) {
    const r = ellipsePts(0, 0, cw * 0.72, ch * 0.62, 26);
    stroke(ctx, r, seed + 17, { color: opts.ring, width: 3, closed: true, amp: 3, alpha: 0.9, passes: 2 });
  }
  ctx.restore();
}

/** A row of cards with a shared baseline, lightly shuffled in angle. */
export function drawCardRow(
  ctx: CanvasRenderingContext2D,
  cards: (CardArt | null)[],
  cx: number,
  cy: number,
  w: number,
  h: number,
  seed: number,
  opts: { gap?: number; reveal?: number; dim?: boolean[]; ring?: (string | undefined)[]; alpha?: number } = {},
): void {
  const gap = opts.gap === undefined ? w * 1.12 : opts.gap;
  const total = (cards.length - 1) * gap;
  const reveal = opts.reveal === undefined ? 1 : opts.reveal;
  for (let i = 0; i < cards.length; i++) {
    const u = clamp(reveal * cards.length - i, 0, 1);
    if (u <= 0) break;
    const s = seed + i * 101;
    const x = cx - total / 2 + i * gap;
    const rise = (1 - easeOut(u)) * 26;
    drawCard(ctx, x, cy + rise, w, h, cards[i], s, {
      angle: srand(s, 3) * 0.045,
      alpha: (opts.alpha === undefined ? 1 : opts.alpha) * easeOut(u),
      dim: opts.dim ? opts.dim[i] : false,
      ring: opts.ring ? opts.ring[i] : undefined,
      lift: 3,
    });
  }
}

/** A fanned hand, the shape a player actually holds. */
export function drawFan(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  count: number,
  w: number,
  h: number,
  seed: number,
  opts: { spread?: number; arc?: number; faceDown?: boolean; cards?: (CardArt | null)[]; alpha?: number; reveal?: number } = {},
): void {
  const spread = opts.spread === undefined ? w * 3.4 : opts.spread;
  const arc = opts.arc === undefined ? 0.5 : opts.arc;
  const reveal = opts.reveal === undefined ? 1 : opts.reveal;
  for (let i = 0; i < count; i++) {
    const u = count > 1 ? i / (count - 1) - 0.5 : 0;
    const shown = clamp(reveal * count - i, 0, 1);
    if (shown <= 0) break;
    drawCard(ctx, cx + u * spread, cy + Math.abs(u) * Math.abs(u) * h * arc * 0.6, w, h, opts.cards ? opts.cards[i] || null : null, seed + i * 37, {
      angle: u * arc,
      faceDown: opts.faceDown,
      alpha: (opts.alpha === undefined ? 1 : opts.alpha) * shown,
      lift: 2,
    });
  }
}

// ---------------------------------------------------------------------------
// Marks made over the top
// ---------------------------------------------------------------------------

/** A curved arrow, drawn on as `progress` runs 0..1. */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  to: Pt,
  seed: number,
  opts: { color?: string; width?: number; bend?: number; progress?: number; head?: number } = {},
): void {
  const progress = opts.progress === undefined ? 1 : clamp(opts.progress, 0, 1);
  if (progress <= 0) return;
  const color = opts.color || INK;
  const width = opts.width === undefined ? 3 : opts.width;
  const bend = opts.bend === undefined ? 0.22 : opts.bend;
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const ctrl: Pt = [mx - dy * bend, my + dx * bend];
  const pts: Pt[] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const a = (1 - u) * (1 - u);
    const b = 2 * (1 - u) * u;
    const c = u * u;
    pts.push([a * from[0] + b * ctrl[0] + c * to[0], a * from[1] + b * ctrl[1] + c * to[1]]);
  }
  stroke(ctx, pts, seed, { color, width, progress, amp: 1.8 });
  if (progress > 0.82) {
    const tip = pts[pts.length - 1];
    const prev = pts[pts.length - 3];
    const a = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
    const len = (opts.head === undefined ? 16 : opts.head) * easeOut((progress - 0.82) / 0.18);
    const spread = 0.42;
    stroke(ctx, [[tip[0] - Math.cos(a - spread) * len, tip[1] - Math.sin(a - spread) * len], tip], seed + 3, { color, width, amp: 1 });
    stroke(ctx, [[tip[0] - Math.cos(a + spread) * len, tip[1] - Math.sin(a + spread) * len], tip], seed + 4, { color, width, amp: 1 });
  }
}

/** The scribbled ring you put round the thing that matters. */
export function drawRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  opts: { color?: string; width?: number; progress?: number; loops?: number } = {},
): void {
  const progress = opts.progress === undefined ? 1 : clamp(opts.progress, 0, 1);
  if (progress <= 0) return;
  const loops = opts.loops === undefined ? 1.75 : opts.loops;
  const steps = Math.round(46 * loops);
  const pts: Pt[] = [];
  const tilt = srand(seed, 21) * 0.12;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2 * loops - 1.1;
    const grow = 1 + (i / steps) * 0.07;
    const x = Math.cos(a) * rx * grow;
    const y = Math.sin(a) * ry * grow;
    pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  stroke(ctx, pts, seed, { color: opts.color || GOLD, width: opts.width === undefined ? 3.4 : opts.width, progress, amp: 2.4, passes: 1 });
}

export function drawTick(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, seed: number, progress = 1, color = "#2f8a5c"): void {
  stroke(
    ctx,
    [
      [cx - size * 0.45, cy],
      [cx - size * 0.1, cy + size * 0.38],
      [cx + size * 0.5, cy - size * 0.45],
    ],
    seed,
    { color, width: size * 0.16, progress, amp: 1.4 },
  );
}

export function drawCross(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, seed: number, progress = 1, color = RED): void {
  const p = clamp(progress, 0, 1);
  stroke(ctx, [[cx - size * 0.42, cy - size * 0.42], [cx + size * 0.42, cy + size * 0.42]], seed, {
    color,
    width: size * 0.15,
    progress: clamp(p * 2, 0, 1),
    amp: 1.4,
  });
  stroke(ctx, [[cx + size * 0.42, cy - size * 0.42], [cx - size * 0.42, cy + size * 0.42]], seed + 1, {
    color,
    width: size * 0.15,
    progress: clamp(p * 2 - 1, 0, 1),
    amp: 1.4,
  });
}

/** A word in a rotated box, slammed onto the paper. */
export function drawStamp(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  size: number,
  seed: number,
  opts: { color?: string; angle?: number; drop?: number; alpha?: number } = {},
): void {
  const color = opts.color || RED;
  const drop = opts.drop === undefined ? 1 : clamp(opts.drop, 0, 1);
  if (drop <= 0) return;
  const scale = lerp(1.7, 1, easeOut(drop));
  const w = inkTextWidth(text, size, size * 0.1) + size * 0.9;
  const h = size * 1.9;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(opts.angle === undefined ? -0.1 : opts.angle);
  ctx.scale(scale, scale);
  ctx.globalAlpha *= (opts.alpha === undefined ? 1 : opts.alpha) * clamp(drop * 2.5, 0, 1);
  const box = rectPts(-w / 2, -h / 2, w, h);
  stroke(ctx, box, seed, { color, width: size * 0.1, closed: true, amp: 2.2, alpha: 0.9 });
  inkText(ctx, text, 0, size * 0.52, size, seed + 3, { color, align: "center", width: size * 0.11, jitter: 0.06 });
  ctx.restore();
}

/** Speed dashes trailing something in motion. */
export function drawWhoosh(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, seed: number, alpha = 1): void {
  const len = Math.hypot(dx, dy);
  if (len < 4 || alpha <= 0.02) return;
  const ux = dx / len;
  const uy = dy / len;
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * 11;
    const l = len * (0.4 + rand(seed, i) * 0.5);
    stroke(
      ctx,
      [
        [x - ux * l - uy * off, y - uy * l + ux * off],
        [x - ux * 8 - uy * off, y - uy * 8 + ux * off],
      ],
      seed + i * 13,
      { color: INK_SOFT, width: 2.2, alpha: alpha * 0.5, passes: 1, amp: 1.2 },
    );
  }
}

export function drawSparkle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, seed: number, alpha = 1): void {
  if (alpha <= 0.02) return;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + rand(seed, i) * 0.2;
    const l = size * (0.6 + rand(seed, i + 9) * 0.5);
    stroke(
      ctx,
      [
        [cx - Math.cos(a) * l, cy - Math.sin(a) * l],
        [cx + Math.cos(a) * l, cy + Math.sin(a) * l],
      ],
      seed + i * 7,
      { color: GOLD, width: size * 0.13, alpha, passes: 1, amp: 0.8 },
    );
  }
}

// ---------------------------------------------------------------------------
// The table and the kit
// ---------------------------------------------------------------------------

/** The felt, as a torn green scrap with a drawn edge. */
export function drawFelt(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, seed: number, alpha = 1): void {
  const pts = ellipsePts(cx, cy, rx, ry, 30);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.save();
  ctx.globalAlpha *= 0.2;
  fill(ctx, ellipsePts(cx + 6, cy + 10, rx, ry, 30), seed + 2, "#3a2f28", { offset: 0 });
  ctx.restore();
  fill(ctx, pts, seed, FELT, { offset: 1.2, amp: 3 });
  hatch(ctx, pts, seed + 3, { color: FELT_DARK, spacing: 16, angle: -0.5, alpha: 0.28, width: 2 });
  stroke(ctx, pts, seed + 5, { color: FELT_DARK, width: 3, closed: true, amp: 3 });
  ctx.restore();
}

/** A stack of penalty chips, tall enough to read at a glance. */
export function drawChips(ctx: CanvasRenderingContext2D, cx: number, baseY: number, count: number, seed: number, color = RED, alpha = 1): void {
  const rx = 26;
  const ry = 8;
  const step = 12;
  ctx.save();
  ctx.globalAlpha *= alpha;
  for (let i = 0; i < count; i++) {
    const y = baseY - i * step;
    const wob = srand(seed, i) * 2.2;
    const pts = ellipsePts(cx + wob, y, rx, ry, 20);
    fill(ctx, pts, seed + i * 17, i % 2 === 0 ? color : "#f0e6d2", { offset: 0.6 });
    stroke(ctx, pts, seed + i * 19, { color: INK, width: 1.6, closed: true, passes: 1, alpha: 0.75 });
  }
  ctx.restore();
}

/** A phone, with a little fanned hand behind the glass. */
export function drawPhone(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  seed: number,
  opts: { angle?: number; alpha?: number; label?: string; cards?: number } = {},
): void {
  const h = w * 1.95;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(opts.angle || 0);
  ctx.globalAlpha *= opts.alpha === undefined ? 1 : opts.alpha;
  const body = tornPts(-w / 2, -h / 2, w, h, seed, 2);
  ctx.save();
  ctx.globalAlpha *= 0.18;
  fill(ctx, tornPts(-w / 2 + 4, -h / 2 + 7, w, h, seed, 2), seed + 1, "#3a2f28", { offset: 0 });
  ctx.restore();
  fill(ctx, body, seed, "#2c2a2e", { offset: 0.6 });
  const screen = rectPts(-w / 2 + w * 0.08, -h / 2 + h * 0.07, w * 0.84, h * 0.86);
  fill(ctx, screen, seed + 3, FELT, { offset: 0.5 });
  const n = opts.cards === undefined ? 5 : opts.cards;
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) - 0.5 : 0;
    drawCard(ctx, u * w * 0.3, h * 0.2, w * 0.24, w * 0.34, null, seed + 40 + i * 11, { angle: u * 0.35, lift: 1 });
  }
  if (opts.label) {
    inkText(ctx, opts.label, 0, -h / 2 + h * 0.2, w * 0.17, seed + 61, { color: "#f4f1e8", align: "center", width: 1.8 });
  }
  stroke(ctx, body, seed + 7, { color: INK, width: 2, closed: true, passes: 1 });
  ctx.restore();
}

/** A tablet lying flat in the middle of the table. */
export function drawTablet(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  seed: number,
  opts: { angle?: number; alpha?: number } = {},
): void {
  const h = w * 0.7;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(opts.angle || 0);
  ctx.globalAlpha *= opts.alpha === undefined ? 1 : opts.alpha;
  const body = tornPts(-w / 2, -h / 2, w, h, seed, 2.4);
  ctx.save();
  ctx.globalAlpha *= 0.2;
  fill(ctx, tornPts(-w / 2 + 5, -h / 2 + 9, w, h, seed, 2.4), seed + 1, "#3a2f28", { offset: 0 });
  ctx.restore();
  fill(ctx, body, seed, "#2c2a2e", { offset: 0.6 });
  const screen = rectPts(-w / 2 + w * 0.05, -h / 2 + h * 0.07, w * 0.9, h * 0.86);
  fill(ctx, screen, seed + 3, FELT_DARK, { offset: 0.5 });
  hatch(ctx, screen, seed + 5, { color: "#0d3527", spacing: 13, angle: -0.5, alpha: 0.35, width: 2 });
  stroke(ctx, body, seed + 7, { color: INK, width: 2.4, closed: true, passes: 1 });
  ctx.restore();
}

/** A QR block, drawn by hand — enough to read as "scan this". */
export function drawQr(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, seed: number, alpha = 1): void {
  const n = 7;
  const cell = size / n;
  ctx.save();
  ctx.globalAlpha *= alpha;
  fill(ctx, rectPts(x - cell * 0.4, y - cell * 0.4, size + cell * 0.8, size + cell * 0.8), seed, "#fdfbf5", { offset: 0.4 });
  const finder = (fx: number, fy: number, k: number): void => {
    stroke(ctx, rectPts(x + fx * cell, y + fy * cell, cell * 3, cell * 3), seed + k, { color: INK, width: cell * 0.42, closed: true, passes: 1, amp: 0.7 });
    fill(ctx, rectPts(x + (fx + 1.15) * cell, y + (fy + 1.15) * cell, cell * 0.7, cell * 0.7), seed + k + 1, INK, { offset: 0.3, amp: 0.5 });
  };
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const inFinder = (gx < 3 && gy < 3) || (gx > 3 && gy < 3) || (gx < 3 && gy > 3);
      if (inFinder) continue;
      if (rand(seed, gy * n + gx) > 0.52) {
        fill(ctx, rectPts(x + gx * cell + cell * 0.1, y + gy * cell + cell * 0.1, cell * 0.8, cell * 0.8), seed + gx * 13 + gy, INK, { offset: 0.3, amp: 0.6 });
      }
    }
  }
  finder(0, 0, 11);
  finder(4, 0, 21);
  finder(0, 4, 31);
  ctx.restore();
}

/** A seated player: a head, shoulders, and a held hand of cards. */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  seed: number,
  opts: { alpha?: number; name?: string; cards?: number; up?: number; color?: string } = {},
): void {
  const alpha = opts.alpha === undefined ? 1 : opts.alpha;
  if (alpha <= 0.02) return;
  const up = opts.up === undefined ? 1 : opts.up;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const shoulder: Pt[] = [
    [cx - size * 0.85, cy + size * 0.95],
    [cx - size * 0.62, cy + size * 0.2],
    [cx, cy + size * 0.02],
    [cx + size * 0.62, cy + size * 0.2],
    [cx + size * 0.85, cy + size * 0.95],
  ];
  fill(ctx, [...shoulder, [cx + size * 0.85, cy + size * 1.1], [cx - size * 0.85, cy + size * 1.1]], seed, opts.color || "#c9743f", { offset: 0.8 });
  stroke(ctx, shoulder, seed + 3, { color: INK, width: 2.6 });
  const head = ellipsePts(cx, cy - size * 0.55, size * 0.45, size * 0.5, 22);
  fill(ctx, head, seed + 5, "#e8c39a", { offset: 0.7 });
  stroke(ctx, head, seed + 7, { color: INK, width: 2.6, closed: true });
  // Two dots and a line: any more face than this and it stops being anybody.
  fill(ctx, ellipsePts(cx - size * 0.16, cy - size * 0.6, size * 0.05, size * 0.06, 10), seed + 9, INK, { offset: 0.2 });
  fill(ctx, ellipsePts(cx + size * 0.16, cy - size * 0.6, size * 0.05, size * 0.06, 10), seed + 11, INK, { offset: 0.2 });
  stroke(ctx, [[cx - size * 0.13, cy - size * 0.38], [cx, cy - size * 0.33], [cx + size * 0.14, cy - size * 0.4]], seed + 13, {
    color: INK,
    width: 2,
    amp: 0.8,
  });
  if (opts.cards) {
    drawFan(ctx, cx, cy + size * 0.8 - up * size * 0.1, Math.min(opts.cards, 7), size * 0.34, size * 0.48, seed + 31, {
      faceDown: true,
      arc: 0.34,
      spread: size * 1.9,
    });
  }
  if (opts.name) {
    inkText(ctx, opts.name, cx, cy + size * 1.55, size * 0.3, seed + 41, { color: INK, align: "center", width: 2 });
  }
  ctx.restore();
}
