import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPTIONS,
  CHAPTERS,
  FILM_DURATION,
  FILM_H,
  FILM_W,
  captionIndexAt,
  chapterAt,
  formatTime,
  renderFrame,
  setFilmBoil,
} from "../lib/explainer/film.ts";
import { SCENES } from "../lib/explainer/scenes.ts";
import { inkTextWidth } from "../lib/explainer/ink.ts";

/**
 * A canvas that writes down what it was asked to draw instead of drawing it.
 * Every path op records its rounded arguments, which is enough both to prove
 * the film draws something in every scene and to prove a given second renders
 * identically every time — the property the scrubber depends on.
 */
function recordingContext(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const num = (v: unknown): string => (typeof v === "number" ? (Math.round(v * 1000) / 1000).toString() : String(v));
  // Drawing state has to behave, not just be recorded: alpha composes through
  // save/restore, so a stub that forgets it would hide exactly the class of bug
  // that made scene fades no-ops.
  const state: Record<string, unknown> = {
    globalAlpha: 1,
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalCompositeOperation: "source-over",
  };
  const stack: Record<string, unknown>[] = [];
  const target: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(obj, prop) {
      const key = String(prop);
      if (key in state) return state[key];
      if (key in obj) return obj[key];
      const fn = function (...args: unknown[]): unknown {
        log.push(key + "(" + args.map(num).join(",") + ")");
        if (key === "save") stack.push({ ...state });
        if (key === "restore") {
          const popped = stack.pop();
          if (popped) for (const k of Object.keys(popped)) state[k] = popped[k];
        }
        if (key === "createRadialGradient" || key === "createLinearGradient") {
          return { addColorStop: () => undefined };
        }
        return undefined;
      };
      obj[key] = fn;
      return fn;
    },
    set(obj, prop, value) {
      const key = String(prop);
      log.push("set " + key + "=" + num(value));
      if (key in state) state[key] = value;
      else obj[key] = value;
      return true;
    },
  };
  const ctx = new Proxy(target, handler) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

test("the film is between two and five minutes long", () => {
  assert.ok(FILM_DURATION >= 120, "too short: " + FILM_DURATION);
  assert.ok(FILM_DURATION <= 300, "too long: " + FILM_DURATION);
  assert.equal(formatTime(FILM_DURATION), "3:50");
});

test("chapters tile the timeline with no gap and no overlap", () => {
  let at = 0;
  for (const chapter of CHAPTERS) {
    assert.equal(chapter.start, at, chapter.id + " starts in the wrong place");
    assert.ok(chapter.duration > 0);
    at += chapter.duration;
  }
  assert.equal(at, FILM_DURATION);
  assert.equal(CHAPTERS.length, SCENES.length);
});

test("captions run in order, inside their own chapter, and never overlap", () => {
  let previousStart = -1;
  for (const cue of CAPTIONS) {
    const chapter = CHAPTERS[cue.chapter];
    assert.ok(cue.start > previousStart, "cues out of order at " + cue.text);
    previousStart = cue.start;
    assert.ok(cue.end > cue.start, "empty cue: " + cue.text);
    assert.ok(cue.start >= chapter.start, "cue starts before its chapter: " + cue.text);
    assert.ok(cue.end <= chapter.start + chapter.duration + 1e-9, "cue outlives its chapter: " + cue.text);
    // A subtitle nobody can finish reading is not a subtitle.
    assert.ok(cue.text.length <= 130, "caption too long to read: " + cue.text);
    assert.ok(cue.end - cue.start >= 1.4, "caption too brief to read: " + cue.text);
  }
});

test("every chapter says something, and the film is never silent for long", () => {
  for (const chapter of CHAPTERS) {
    const mine = CAPTIONS.filter((c) => c.chapter === chapter.index);
    assert.ok(mine.length > 0, chapter.id + " has no captions");
  }
  let gap = 0;
  for (let t = 0; t < FILM_DURATION; t += 0.5) {
    gap = captionIndexAt(t) === -1 ? gap + 0.5 : 0;
    assert.ok(gap <= 3, "no subtitle for " + gap + "s around " + formatTime(t));
  }
});

test("chapterAt and captionIndexAt agree with the timeline at its edges", () => {
  assert.equal(chapterAt(0).index, 0);
  assert.equal(chapterAt(-5).index, 0);
  assert.equal(chapterAt(FILM_DURATION).index, CHAPTERS.length - 1);
  for (const chapter of CHAPTERS) {
    assert.equal(chapterAt(chapter.start + 0.01).index, chapter.index);
    assert.equal(chapterAt(chapter.start + chapter.duration - 0.01).index, chapter.index);
  }
  for (const cue of CAPTIONS) {
    assert.equal(CAPTIONS[captionIndexAt(cue.start)].text, cue.text);
    assert.equal(CAPTIONS[captionIndexAt(cue.end - 0.01)].text, cue.text);
  }
});

test("alpha composes through save and restore, so a faded group really fades", () => {
  const { ctx } = recordingContext();
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.globalAlpha *= 0.5;
  ctx.save();
  ctx.globalAlpha *= 0.5;
  assert.equal(ctx.globalAlpha, 0.25);
  ctx.restore();
  assert.equal(ctx.globalAlpha, 0.5);
  ctx.restore();
  assert.equal(ctx.globalAlpha, 1);
});

test("a scene that has faded out stops putting ink on the paper", () => {
  // The last third of a second of every chapter is the fade to the next one.
  for (const chapter of CHAPTERS) {
    const { ctx, log } = recordingContext();
    renderFrame(ctx, chapter.start + chapter.duration - 0.005, FILM_W, FILM_H);
    const inked = log.filter((line) => line.startsWith("set globalAlpha="));
    const faded = inked.filter((line) => Number(line.slice("set globalAlpha=".length)) < 0.05);
    assert.ok(faded.length > 0, chapter.id + " never fades out before the next chapter");
  }
});

test("every second of the film draws without throwing, and every scene draws something", () => {
  setFilmBoil(true);
  const drawn = new Map<number, number>();
  for (let t = 0; t <= FILM_DURATION; t += 0.25) {
    const { ctx, log } = recordingContext();
    renderFrame(ctx, t, FILM_W, FILM_H);
    const chapter = chapterAt(t);
    drawn.set(chapter.index, Math.max(drawn.get(chapter.index) || 0, log.length));
    assert.ok(log.length > 20, "frame at " + t + "s barely drew anything");
  }
  for (const chapter of CHAPTERS) {
    assert.ok((drawn.get(chapter.index) || 0) > 200, chapter.id + " never draws a real frame");
  }
});

test("a given second always renders the same picture, which is what lets it be scrubbed", () => {
  setFilmBoil(true);
  for (const t of [0.3, 7.5, 23, 61.25, 118, 175.5, 229.5]) {
    const a = recordingContext();
    const b = recordingContext();
    renderFrame(a.ctx, t, FILM_W, FILM_H);
    renderFrame(b.ctx, t, FILM_W, FILM_H);
    assert.deepEqual(a.log, b.log, "frame at " + t + "s is not reproducible");
  }
});

test("freezing the boil stops the line work moving between frames", () => {
  const sample = (t: number): string[] => {
    const { ctx, log } = recordingContext();
    renderFrame(ctx, t, FILM_W, FILM_H);
    return log;
  };
  setFilmBoil(true);
  // Two frames 1/60s apart differ only through the boil and the slow drift.
  const moving = sample(40).join("|") !== sample(40 + 1 / 7).join("|");
  assert.ok(moving, "the ink is not boiling at all");
  setFilmBoil(false);
  const frozenA = sample(40);
  const frozenB = sample(40 + 1 / 7);
  let differences = 0;
  for (let i = 0; i < Math.min(frozenA.length, frozenB.length); i++) {
    if (frozenA[i] !== frozenB[i]) differences++;
  }
  // Scene motion still advances, but the pen no longer re-wobbles every frame.
  assert.ok(differences < frozenA.length * 0.5, "freezing the boil changed almost everything");
  setFilmBoil(true);
});

test("hand lettering measures wider as it gets bigger, and spaces cost less than letters", () => {
  assert.ok(inkTextWidth("PASS", 40) > inkTextWidth("PASS", 20));
  assert.ok(inkTextWidth("A A", 30) < inkTextWidth("AAA", 30));
  assert.equal(inkTextWidth("", 30), 0);
});

test("the film is composed sixteen by nine", () => {
  assert.equal(Math.round((FILM_W / FILM_H) * 100) / 100, 1.78);
});
