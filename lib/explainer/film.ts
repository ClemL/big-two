/**
 * The film itself: one pure function of elapsed time.
 *
 * `renderFrame(ctx, t, w, h)` draws second `t` and nothing else — no state
 * accumulates between calls — so playing, pausing, scrubbing and re-rendering a
 * poster frame are all the same operation with a different number. That is also
 * what makes the whole timeline testable without a browser.
 */

import {
  GOLD,
  INK,
  INK_SOFT,
  PAPER,
  clamp,
  easeInOut,
  fill,
  lerp,
  rand,
  ramp,
  setBoilRate,
  setInkClock,
  srand,
  stroke,
  tornPts,
  type Pt,
} from "./ink.ts";
import { FILM_H, FILM_W, SCENES, type Scene } from "./scenes.ts";

export { FILM_H, FILM_W } from "./scenes.ts";

export interface Chapter {
  index: number;
  id: string;
  title: string;
  start: number;
  duration: number;
}

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
  chapter: number;
}

function buildChapters(scenes: Scene[]): Chapter[] {
  const out: Chapter[] = [];
  let at = 0;
  for (let i = 0; i < scenes.length; i++) {
    out.push({ index: i, id: scenes[i].id, title: scenes[i].title, start: at, duration: scenes[i].duration });
    at += scenes[i].duration;
  }
  return out;
}

export const CHAPTERS: Chapter[] = buildChapters(SCENES);

export const FILM_DURATION: number = CHAPTERS.reduce((a, c) => a + c.duration, 0);

/**
 * Captions flattened onto the film clock. Each one runs until the next cue in
 * the same scene, or to the end of that scene — a caption never outlives the
 * picture it belongs to.
 */
export const CAPTIONS: CaptionCue[] = (() => {
  const out: CaptionCue[] = [];
  SCENES.forEach((scene, i) => {
    const base = CHAPTERS[i].start;
    scene.captions.forEach((cap, k) => {
      const next = scene.captions[k + 1];
      const end = base + (next ? next.at : scene.duration);
      out.push({ start: base + cap.at, end, text: cap.text, chapter: i });
    });
  });
  return out;
})();

export function chapterAt(t: number): Chapter {
  const clamped = clamp(t, 0, FILM_DURATION - 0.0001);
  for (let i = CHAPTERS.length - 1; i >= 0; i--) {
    if (clamped >= CHAPTERS[i].start) return CHAPTERS[i];
  }
  return CHAPTERS[0];
}

/** Index into CAPTIONS, or -1 in a gap. */
export function captionIndexAt(t: number): number {
  for (let i = 0; i < CAPTIONS.length; i++) {
    if (t >= CAPTIONS[i].start && t < CAPTIONS[i].end) return i;
  }
  return -1;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return String(Math.floor(s / 60)) + ":" + String(s % 60).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Paper stock
// ---------------------------------------------------------------------------

let paperCache: { w: number; h: number; canvas: HTMLCanvasElement } | null = null;

/**
 * The sheet everything is drawn on, baked once. Grain has to be baked: redrawn
 * per frame it reads as television snow and drowns the line work.
 */
function paperStock(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (paperCache && paperCache.w === w && paperCache.h === h) return paperCache.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.fillStyle = PAPER;
  g.fillRect(0, 0, canvas.width, canvas.height);

  // Blotches: uneven pulp, so the sheet is not one flat colour.
  for (let i = 0; i < 120; i++) {
    const x = rand(7001, i * 3) * canvas.width;
    const y = rand(7002, i * 5) * canvas.height;
    const r = 40 + rand(7003, i) * 190;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const warm = rand(7004, i) > 0.5;
    grd.addColorStop(0, warm ? "rgba(214,188,140,0.07)" : "rgba(255,250,236,0.09)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Fibres: short pale and dark hairs pressed into the pulp.
  for (let i = 0; i < 900; i++) {
    const x = rand(7101, i * 7) * canvas.width;
    const y = rand(7102, i * 11) * canvas.height;
    const a = rand(7103, i) * Math.PI;
    const l = 2 + rand(7104, i) * 9;
    g.strokeStyle = rand(7105, i) > 0.5 ? "rgba(120,100,74,0.10)" : "rgba(255,252,240,0.16)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }

  // Speckle.
  for (let i = 0; i < 2600; i++) {
    const x = rand(7201, i * 13) * canvas.width;
    const y = rand(7202, i * 17) * canvas.height;
    g.fillStyle = rand(7203, i) > 0.62 ? "rgba(92,76,56,0.09)" : "rgba(255,255,248,0.12)";
    g.fillRect(x, y, 1.4, 1.4);
  }

  // A tea-stain or two, and darkened edges, so the sheet has a history.
  for (let i = 0; i < 3; i++) {
    const x = (0.2 + rand(7301, i) * 0.6) * canvas.width;
    const y = (0.2 + rand(7302, i) * 0.6) * canvas.height;
    const r = 90 + rand(7303, i) * 120;
    const grd = g.createRadialGradient(x, y, r * 0.55, x, y, r);
    grd.addColorStop(0, "rgba(176,140,86,0.00)");
    grd.addColorStop(0.82, "rgba(176,140,86,0.06)");
    grd.addColorStop(1, "rgba(176,140,86,0.00)");
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const edge = g.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.36, canvas.width / 2, canvas.height / 2, canvas.height * 0.82);
  edge.addColorStop(0, "rgba(70,52,32,0)");
  edge.addColorStop(1, "rgba(70,52,32,0.16)");
  g.fillStyle = edge;
  g.fillRect(0, 0, canvas.width, canvas.height);

  paperCache = { w, h, canvas };
  return canvas;
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

const WIPE = 0.55;

/** The torn sheet that slides off to uncover a new chapter. */
function drawWipe(ctx: CanvasRenderingContext2D, into: number, seed: number): void {
  if (into < 0 || into > WIPE) return;
  const u = easeInOut(into / WIPE);
  const shift = lerp(0, -(FILM_W + 200), u);
  ctx.save();
  ctx.translate(shift, 0);
  const pts = tornPts(-FILM_W, -40, FILM_W * 2, FILM_H + 80, seed, 16);
  fill(ctx, pts, seed, PAPER, { offset: 0, amp: 5 });
  stroke(
    ctx,
    [
      [FILM_W - 6, -20],
      [FILM_W + 4, FILM_H / 2],
      [FILM_W - 8, FILM_H + 20],
    ],
    seed + 3,
    { color: INK_SOFT, width: 2.4, alpha: 0.4, passes: 1, amp: 6 },
  );
  // Flecks of paper thrown off the tear.
  for (let i = 0; i < 7; i++) {
    const y = rand(seed, i * 3) * FILM_H;
    const x = FILM_W + 12 + rand(seed, i * 5) * 60 * u;
    ctx.save();
    ctx.globalAlpha *= 0.5 * (1 - u);
    fill(ctx, tornPts(x, y, 14 + rand(seed, i) * 16, 9 + rand(seed, i + 9) * 10, seed + i, 2), seed + i * 7, PAPER, { offset: 0 });
    ctx.restore();
  }
  ctx.restore();
}

/** A drawn progress rule along the bottom, with a tick per chapter. */
function drawProgress(ctx: CanvasRenderingContext2D, t: number): void {
  const y = FILM_H - 12;
  const x0 = 26;
  const x1 = FILM_W - 26;
  stroke(ctx, [[x0, y], [x1, y]], 8801, { color: INK_SOFT, width: 2.2, alpha: 0.22, passes: 1, amp: 1 });
  const played = clamp(t / FILM_DURATION, 0, 1);
  if (played > 0.002) {
    stroke(ctx, [[x0, y], [lerp(x0, x1, played), y]], 8802, { color: GOLD, width: 3.4, alpha: 0.75, passes: 1, amp: 1.2 });
  }
  for (const ch of CHAPTERS) {
    const x = lerp(x0, x1, ch.start / FILM_DURATION);
    stroke(ctx, [[x, y - 5], [x, y + 5]], 8900 + ch.index, { color: INK_SOFT, width: 1.8, alpha: 0.3, passes: 1, amp: 0.6 });
  }
}

/**
 * Draw the frame at `t` seconds into a `w` x `h` box. The caller owns the
 * device-pixel-ratio transform; everything here is in logical pixels.
 */
export function renderFrame(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void {
  const time = clamp(t, 0, FILM_DURATION);
  setInkClock(time);

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);

  const scale = Math.min(w / FILM_W, h / FILM_H);
  const ox = (w - FILM_W * scale) / 2;
  const oy = (h - FILM_H * scale) / 2;
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  const stock = paperStock(FILM_W, FILM_H);
  if (stock) ctx.drawImage(stock, 0, 0, FILM_W, FILM_H);

  const chapter = chapterAt(time);
  const scene = SCENES[chapter.index];
  const into = time - chapter.start;

  ctx.save();
  // Scenes land after the wipe has passed, and clear out just before the next.
  const fadeIn = ramp(into, WIPE * 0.35, WIPE * 0.9);
  const fadeOut = 1 - ramp(into - (chapter.duration - 0.34), 0, 0.34);
  ctx.globalAlpha *= clamp(fadeIn * fadeOut, 0, 1);
  // A hair of drift keeps a held frame from looking like a still.
  const drift = Math.sin(time * 0.55 + chapter.index) * 1.6;
  ctx.translate(drift, Math.cos(time * 0.4 + chapter.index) * 1.2);
  ctx.beginPath();
  ctx.rect(0, 0, FILM_W, FILM_H);
  ctx.clip();
  scene.draw(ctx, into);
  ctx.restore();

  drawProgress(ctx, time);
  drawWipe(ctx, into, 8600 + chapter.index * 37);
  ctx.restore();
}

/** Freeze the line work for viewers who asked for less motion. */
export function setFilmBoil(enabled: boolean): void {
  setBoilRate(enabled ? 7 : 0);
}
