/**
 * The explainer film, scene by scene.
 *
 * A scene is a pure function of its own elapsed time. Nothing accumulates, so
 * scrubbing, pausing and replaying are all the same operation: call draw with a
 * different number. Captions are data, not pixels — the component renders them
 * as real text so they can be read by a screen reader and copied out.
 */

import {
  BLUE,
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
  pop,
  ramp,
  rand,
  rectPts,
  scrap,
  srand,
  stroke,
  tape,
  tornPts,
  window4,
  type Pt,
  type SuitKey,
} from "./ink.ts";
import {
  drawArrow,
  drawCard,
  drawCardRow,
  drawChips,
  drawCross,
  drawFan,
  drawFelt,
  drawPhone,
  drawPlayer,
  drawQr,
  drawRing,
  drawSparkle,
  drawStamp,
  drawTablet,
  drawTick,
  drawWhoosh,
  type CardArt,
} from "./props.ts";

/** The film is composed at this size and scaled to fit whatever it is given. */
export const FILM_W = 1280;
export const FILM_H = 720;

export interface Caption {
  /** Seconds from the start of the scene. */
  at: number;
  text: string;
}

export interface Scene {
  id: string;
  /** Chapter label, shown on the paper and in the chapter list. */
  title: string;
  duration: number;
  captions: Caption[];
  draw: (ctx: CanvasRenderingContext2D, t: number) => void;
}

function c(rank: string, suit: SuitKey): CardArt {
  return { rank, suit };
}

/** A hand-lettered heading with an underline that sweeps in behind it. */
function heading(ctx: CanvasRenderingContext2D, text: string, t: number, seed: number, y = 104, size = 52): void {
  const p = ramp(t, 0.15, 1.1);
  inkText(ctx, text, FILM_W / 2, y, size, seed, { align: "center", color: INK, width: size * 0.1, progress: p, jitter: 0.03 });
  const w = inkTextWidth(text, size, size * 0.06);
  stroke(
    ctx,
    [
      [FILM_W / 2 - w / 2 - 8, y + 18],
      [FILM_W / 2 + w / 2 + 10, y + 14],
    ],
    seed + 9,
    { color: GOLD, width: 5, progress: ramp(t, 0.7, 1.5), amp: 2.4, passes: 1, alpha: 0.85 },
  );
}

/** A short note in the margin, in the smaller hand. */
function note(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  t: number,
  seed: number,
  opts: { size?: number; color?: string; align?: "left" | "center" | "right"; at?: number } = {},
): void {
  const at = opts.at === undefined ? 0 : opts.at;
  const p = ramp(t - at, 0, 0.55);
  if (p <= 0) return;
  const size = opts.size === undefined ? 26 : opts.size;
  inkText(ctx, text, x, y, size, seed, {
    align: opts.align || "center",
    color: opts.color || INK_SOFT,
    width: size * 0.09,
    progress: p,
  });
}

/** A word pinned to the paper on its own torn scrap. */
function labelScrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  t: number,
  seed: number,
  opts: { size?: number; color?: string; angle?: number; at?: number; paper?: string } = {},
): void {
  const at = opts.at === undefined ? 0 : opts.at;
  const p = pop(ramp(t - at, 0, 0.45));
  if (p <= 0.01) return;
  const size = opts.size === undefined ? 28 : opts.size;
  const w = inkTextWidth(text, size, size * 0.08) + size * 1.2;
  const h = size * 2.1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(opts.angle === undefined ? srand(seed, 3) * 0.05 : opts.angle);
  ctx.scale(p, p);
  ctx.globalAlpha *= clamp(p * 1.4, 0, 1);
  scrap(ctx, -w / 2, -h / 2, w, h, seed, { color: opts.paper || "#f7edd8", amp: 3 });
  inkText(ctx, text, 0, size * 0.45, size, seed + 5, {
    align: "center",
    color: opts.color || INK,
    width: size * 0.1,
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 1. Title
// ---------------------------------------------------------------------------

const title: Scene = {
  id: "title",
  title: "Big Two",
  duration: 14,
  captions: [
    { at: 0.3, text: "Four players. Thirteen cards each. No bidding, no trumps, no partners." },
    { at: 7.0, text: "Empty your hand before anyone else and you win the round." },
  ],
  draw(ctx, t) {
    // Cards drop in from above the paper and settle into a spread.
    const drops = 9;
    const dropArt: (CardArt | null)[] = [
      c("2", "S"),
      null,
      c("A", "H"),
      c("3", "D"),
      null,
      c("K", "C"),
      c("10", "D"),
      null,
      c("Q", "S"),
    ];
    for (let i = 0; i < drops; i++) {
      const seed = 4100 + i * 71;
      const delay = 0.15 + i * 0.16;
      const p = easeOut(clamp((t - delay) / 1.1, 0, 1));
      if (p <= 0) continue;
      const tx = 210 + i * 108 + srand(seed, 1) * 14;
      const ty = 560 + Math.sin(i * 0.8) * 26;
      const x = tx;
      const y = lerp(-220, ty, p);
      const angle = lerp(srand(seed, 2) * 1.4, srand(seed, 3) * 0.22, p);
      drawWhoosh(ctx, x, y, 0, (1 - p) * 120, seed, 1 - p);
      drawCard(ctx, x, y, 96, 134, dropArt[i], seed, { angle, faceDown: i % 3 === 1, lift: 4 + (1 - p) * 20 });
    }

    const tp = ramp(t, 0.9, 2.6);
    inkText(ctx, "BIG TWO", FILM_W / 2, 250, 132, 9001, {
      align: "center",
      color: INK,
      width: 13,
      progress: tp,
      jitter: 0.05,
    });
    if (tp > 0.98) {
      const shine = window4(t, 2.4, 2.9, 3.4, 4.2);
      drawSparkle(ctx, 330, 160, 34, 501, shine);
      drawSparkle(ctx, 960, 190, 28, 502, shine * 0.8);
    }
    note(ctx, "HONG KONG RULES", FILM_W / 2, 310, t, 9002, { size: 34, at: 2.5, color: GOLD });

    const suits: SuitKey[] = ["D", "C", "H", "S"];
    for (let i = 0; i < 4; i++) {
      const p = pop(ramp(t - (3.4 + i * 0.22), 0, 0.5));
      if (p <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha *= clamp(p, 0, 1);
      drawSuit(ctx, suits[i], FILM_W / 2 - 150 + i * 100, 388, 56 * p, 7100 + i * 13, {});
      ctx.restore();
    }

    note(ctx, "13 CARDS EACH · FIRST OUT WINS", FILM_W / 2, 462, t, 9003, { size: 30, at: 5.4, color: INK });
  },
};

// ---------------------------------------------------------------------------
// 2. The deal
// ---------------------------------------------------------------------------

const seatsAt: Pt[] = [
  [FILM_W / 2, 570],
  [232, 372],
  [FILM_W / 2, 186],
  [1048, 372],
];

const deal: Scene = {
  id: "deal",
  title: "The table",
  duration: 16,
  captions: [
    { at: 0.3, text: "The whole deck goes out — fifty-two cards, thirteen each, nothing left in the middle." },
    { at: 5.4, text: "You sit at the bottom. The other three seats are machines, or friends on their phones." },
    { at: 10.2, text: "Whoever holds the three of diamonds opens the round, and has to lead it." },
  ],
  draw(ctx, t) {
    drawFelt(ctx, FILM_W / 2, 384, 372, 196, 2201, ramp(t, 0.1, 0.9));

    const names = ["YOU", "WEST", "NORTH", "EAST"];
    for (let i = 0; i < 4; i++) {
      const p = ramp(t - (0.5 + i * 0.18), 0, 0.5);
      if (p <= 0) continue;
      const [x, y] = seatsAt[i];
      const dealt = clamp((t - (2.1 + i * 0.12)) / 2.4, 0, 1);
      ctx.save();
      ctx.globalAlpha *= p;
      drawPlayer(ctx, x, y - (i === 2 ? 46 : 0), 62, 3100 + i * 37, {
        name: names[i],
        cards: Math.round(dealt * 13),
        color: ["#c9743f", "#5f7f9b", "#8c6aa8", "#7f9b5f"][i],
      });
      ctx.restore();
    }

    // Cards leaving the deck, four at a time, one to each seat.
    const flights = 13;
    for (let k = 0; k < flights; k++) {
      for (let i = 0; i < 4; i++) {
        const start = 2.0 + (k * 4 + i) * 0.045;
        const u = clamp((t - start) / 0.42, 0, 1);
        if (u <= 0 || u >= 1) continue;
        const [sx, sy] = seatsAt[i];
        const x = lerp(FILM_W / 2, sx, easeOut(u));
        const y = lerp(384, sy + 30, easeOut(u));
        drawWhoosh(ctx, x, y, x - FILM_W / 2, y - 384, 5200 + k * 7 + i, 1 - u);
        drawCard(ctx, x, y, 46, 64, null, 5300 + k * 11 + i, { faceDown: true, angle: (x - FILM_W / 2) * 0.0016, lift: 8 });
      }
    }
    // Without this the middle of the table is bare for five seconds.
    const countT = t - 5.2;
    if (countT > 0) {
      ctx.save();
      ctx.globalAlpha *= ramp(countT, 0, 0.5) * (1 - ramp(countT, 3.8, 4.4));
      labelScrap(ctx, "52 CARDS \u00b7 13 EACH", FILM_W / 2, 384, countT, 5601, { at: 0, size: 30 });
      ctx.restore();
    }

    const deckLeft = clamp(1 - (t - 2.0) / 2.6, 0, 1);
    if (deckLeft > 0.02) {
      for (let i = 0; i < Math.round(deckLeft * 6); i++) {
        drawCard(ctx, FILM_W / 2 + i * 1.6, 384 - i * 2.2, 52, 72, null, 5400 + i, { faceDown: true, angle: srand(5400 + i, 2) * 0.05, lift: 2 });
      }
    }

    // The three of diamonds, found in your hand.
    const showThree = t - 9.6;
    if (showThree > 0) {
      const p = pop(ramp(showThree, 0, 0.5));
      drawCard(ctx, FILM_W / 2, 384, 104, 146, c("3", "D"), 5501, { alpha: clamp(p * 1.3, 0, 1), scale: p, lift: 8, angle: -0.04 });
      drawRing(ctx, FILM_W / 2, 384, 86, 104, 5502, { progress: ramp(showThree, 0.5, 1.4) });
      labelScrap(ctx, "LEADS THE ROUND", FILM_W / 2 + 214, 216, showThree, 5503, { at: 1.2, color: RED, angle: 0.05 });
      drawArrow(ctx, [FILM_W / 2 + 130, 252], [FILM_W / 2 + 66, 336], 5504, {
        progress: ramp(showThree, 1.5, 2.1),
        color: RED,
        bend: 0.2,
      });
    }
  },
};

// ---------------------------------------------------------------------------
// 3. Rank order
// ---------------------------------------------------------------------------

const RANK_LADDER = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];

const ranks: Scene = {
  id: "ranks",
  title: "Card order",
  duration: 22,
  captions: [
    { at: 0.3, text: "Cards climb from the three." },
    { at: 3.2, text: "Four, five, six, seven, eight, nine, ten…" },
    { at: 7.4, text: "…jack, queen, king, ace…" },
    { at: 10.4, text: "…and then the two. In Big Two the two is the highest card in the deck." },
    { at: 15.4, text: "Which makes the three of diamonds the single weakest card on the table." },
    { at: 19.4, text: "It is also the card that has to be led first — you open with your worst." },
  ],
  draw(ctx, t) {
    heading(ctx, "LOW TO HIGH", t, 3301);

    const n = RANK_LADDER.length;
    const stepX = 84;
    const x0 = FILM_W / 2 - ((n - 1) * stepX) / 2;
    for (let i = 0; i < n; i++) {
      const start = 1.1 + i * 0.62;
      const u = clamp((t - start) / 0.5, 0, 1);
      if (u <= 0) continue;
      const x = x0 + i * stepX;
      const y = 560 - i * 21;
      const seed = 3400 + i * 53;
      // The step the card stands on.
      stroke(
        ctx,
        [
          [x - 38, y + 74],
          [x + 40, y + 72],
        ],
        seed + 3,
        { color: INK_SOFT, width: 3, alpha: 0.5, passes: 1, progress: u },
      );
      const rise = (1 - easeOut(u)) * 40;
      drawCard(ctx, x, y - rise, 66, 92, c(RANK_LADDER[i], i === n - 1 ? "S" : (["D", "C", "H", "S"] as SuitKey[])[i % 4]), seed, {
        angle: srand(seed, 7) * 0.06,
        alpha: easeOut(u),
        lift: 3,
      });
    }

    const lowT = t - 9.0;
    if (lowT > 0) {
      drawRing(ctx, x0, 560, 56, 70, 3501, { progress: ramp(lowT, 0, 0.8), color: BLUE });
      labelScrap(ctx, "LOWEST", x0 + 6, 668, lowT, 3502, { at: 0.5, size: 24, color: BLUE, angle: -0.04 });
    }
    const highT = t - 11.8;
    if (highT > 0) {
      drawRing(ctx, x0 + (n - 1) * stepX, 560 - (n - 1) * 21, 58, 72, 3601, { progress: ramp(highT, 0, 0.8), color: RED });
      labelScrap(ctx, "HIGHEST", x0 + (n - 1) * stepX - 20, 204, highT, 3602, { at: 0.5, size: 24, color: RED, angle: 0.05 });
    }

    const lastT = t - 15.6;
    if (lastT > 0) {
      const p = ramp(lastT, 0, 0.6);
      ctx.save();
      ctx.globalAlpha *= p * window4(lastT, 0, 0.6, 5.2, 6.0);
      scrap(ctx, 132, 108, 300, 132, 3701, { color: "#f7edd8", angle: -0.03, amp: 4 });
      tape(ctx, 150, 112, 58, -0.5, 3702);
      drawCard(ctx, 214, 176, 70, 98, c("3", "D"), 3703, { angle: -0.05, lift: 4 });
      note(ctx, "THE LOWEST", 344, 160, lastT, 3704, { size: 22, at: 0.4 });
      note(ctx, "CARD THERE IS", 344, 190, lastT, 3705, { size: 22, at: 0.7 });
      ctx.restore();
    }
  },
};

// ---------------------------------------------------------------------------
// 4. Suit order
// ---------------------------------------------------------------------------

const suits: Scene = {
  id: "suits",
  title: "Suits break ties",
  duration: 16,
  captions: [
    { at: 0.3, text: "Two cards of the same rank still are not equal: the suit breaks the tie." },
    { at: 4.6, text: "Diamonds are weakest, then clubs, then hearts, then spades." },
    { at: 9.6, text: "So the seven of spades beats every other seven, and no two cards ever tie." },
  ],
  draw(ctx, t) {
    heading(ctx, "SAME RANK? SUIT DECIDES", t, 4401);

    const order: SuitKey[] = ["D", "C", "H", "S"];
    const stepX = 200;
    const x0 = FILM_W / 2 - ((order.length - 1) * stepX) / 2;
    for (let i = 0; i < order.length; i++) {
      const u = clamp((t - (1.0 + i * 0.7)) / 0.5, 0, 1);
      if (u <= 0) continue;
      const x = x0 + i * stepX;
      const lift = (1 - easeOut(u)) * 34;
      drawCard(ctx, x, 356 - lift, 126, 176, c("7", order[i]), 4500 + i * 91, {
        angle: srand(4500 + i * 91, 5) * 0.05,
        alpha: easeOut(u),
        lift: 5,
      });
      note(ctx, ["DIAMONDS", "CLUBS", "HEARTS", "SPADES"][i], x, 486, t, 4600 + i, { size: 22, at: 1.2 + i * 0.7 });
      if (i < order.length - 1) {
        const lt = clamp((t - (2.0 + i * 0.7)) / 0.4, 0, 1);
        inkText(ctx, "<", x + stepX / 2, 372, 46, 4700 + i, { align: "center", color: GOLD, width: 6, progress: lt });
      }
    }

    const winT = t - 8.6;
    if (winT > 0) {
      drawRing(ctx, x0 + 3 * stepX, 356, 92, 116, 4801, { progress: ramp(winT, 0, 0.9), color: RED });
      labelScrap(ctx, "BEATS THE OTHER THREE", FILM_W / 2 + 120, 578, winT, 4802, { at: 0.8, size: 24, color: RED, angle: -0.03 });
      drawArrow(ctx, [FILM_W / 2 + 268, 540], [x0 + 3 * stepX + 30, 462], 4803, {
        progress: ramp(winT, 1.3, 2.0),
        color: RED,
        bend: -0.18,
      });
    }
    const rowT = t - 4.4;
    if (rowT > 0) {
      ctx.save();
      ctx.globalAlpha *= ramp(rowT, 0, 0.5);
      for (let i = 0; i < order.length; i++) drawSuit(ctx, order[i], 470 + i * 44, 620, 30, 4900 + i, {});
      inkText(ctx, "WEAK TO STRONG", 676, 630, 24, 4950, { color: INK_SOFT, width: 2.2 });
      ctx.restore();
    }
  },
};

// ---------------------------------------------------------------------------
// 5. Shapes
// ---------------------------------------------------------------------------

const shapes: Scene = {
  id: "shapes",
  title: "What you may lead",
  duration: 26,
  captions: [
    { at: 0.3, text: "There are only a few shapes you are allowed to put down." },
    { at: 3.4, text: "One card on its own." },
    { at: 6.2, text: "A pair — two of the same rank." },
    { at: 9.2, text: "A triple — three of the same rank." },
    { at: 12.4, text: "Or five cards, which is where the game really lives." },
    { at: 16.4, text: "Four of a kind on its own is not a legal shape here." },
    { at: 19.8, text: "Quads only count as part of a five-card hand, with any fifth card attached." },
    { at: 23.4, text: "Whatever shape you lead, everyone else has to answer with the same shape." },
  ],
  draw(ctx, t) {
    heading(ctx, "THE SHAPES", t, 5401);

    const groups: { label: string; cards: CardArt[]; at: number; x: number }[] = [
      { label: "SINGLE", cards: [c("9", "H")], at: 2.6, x: 190 },
      { label: "PAIR", cards: [c("J", "D"), c("J", "S")], at: 5.4, x: 430 },
      { label: "TRIPLE", cards: [c("5", "C"), c("5", "H"), c("5", "S")], at: 8.4, x: 730 },
      { label: "FIVE CARDS", cards: [c("6", "D"), c("7", "D"), c("8", "D"), c("9", "D"), c("10", "D")], at: 11.6, x: 1072 },
    ];
    for (const g of groups) {
      const lt = t - g.at;
      if (lt <= 0) continue;
      const u = clamp(lt / 0.7, 0, 1);
      const w = g.cards.length > 3 ? 58 : 76;
      const h = w * 1.4;
      drawCardRow(ctx, g.cards, g.x, 320, w, h, 5500 + Math.round(g.at * 10), { gap: w * 0.86, reveal: u });
      note(ctx, g.label, g.x, 430, lt, 5600 + Math.round(g.at * 10), { size: 24, at: 0.5 });
      const tick = ramp(lt, 0.8, 1.3);
      if (tick > 0) drawTick(ctx, g.x, 472, 40, 5700 + Math.round(g.at * 10), tick);
    }

    // The two bottom panels share the same patch of paper, so the first has to
    // be gone before the second arrives.
    const quadT = t - 15.4;
    if (quadT > 0) {
      ctx.save();
      ctx.globalAlpha = window4(quadT, 0, 0.5, 3.0, 3.7);
      scrap(ctx, 306, 500, 668, 190, 5801, { color: "#f4e7cf", angle: 0.012, amp: 4 });
      drawCardRow(ctx, [c("K", "D"), c("K", "C"), c("K", "H"), c("K", "S")], 512, 582, 62, 86, 5802, {
        gap: 78,
        reveal: ramp(quadT, 0.2, 0.9),
      });
      drawCross(ctx, 512, 582, 150, 5803, ramp(quadT, 1.0, 1.8));
      note(ctx, "FOUR IS NOT", 826, 566, quadT, 5804, { size: 25, at: 1.4, color: RED });
      note(ctx, "A SHAPE", 826, 602, quadT, 5805, { size: 25, at: 1.7, color: RED });
      ctx.restore();
    }

    const fiveT = t - 19.2;
    if (fiveT > 0) {
      ctx.save();
      ctx.globalAlpha = ramp(fiveT, 0, 0.5);
      scrap(ctx, 306, 500, 668, 190, 5901, { color: "#f2e7cc", angle: -0.01, amp: 4 });
      drawCardRow(
        ctx,
        [c("K", "D"), c("K", "C"), c("K", "H"), c("K", "S"), c("4", "D")],
        534,
        574,
        62,
        86,
        5902,
        { gap: 78, reveal: ramp(fiveT, 0.2, 1.0) },
      );
      drawTick(ctx, 880, 574, 46, 5903, ramp(fiveT, 1.1, 1.7));
      note(ctx, "QUADS + ANY FIFTH CARD = A LEGAL FIVE", 640, 664, fiveT, 5904, { size: 22, at: 1.3 });
      ctx.restore();
    }
  },
};

// ---------------------------------------------------------------------------
// 6. Beating what is on the table
// ---------------------------------------------------------------------------

const beating: Scene = {
  id: "beating",
  title: "Beating the pile",
  duration: 20,
  captions: [
    { at: 0.3, text: "Say a pair of sevens is on the table." },
    { at: 3.4, text: "You may answer with a higher pair — nothing else." },
    { at: 7.2, text: "Not a single card. Not a triple. Not a lower pair." },
    { at: 11.6, text: "A pair is ranked by its higher card, so a pair of nines takes it." },
    { at: 15.6, text: "The same idea runs all the way up: match the shape, then beat it." },
  ],
  draw(ctx, t) {
    heading(ctx, "MATCH IT, THEN BEAT IT", t, 6401);

    const pileU = clamp(t / 0.7, 0, 1);
    scrap(ctx, 470, 176, 340, 62, 6402, { color: "#f4e7cf", angle: -0.01, amp: 3 });
    note(ctx, "ON THE TABLE", FILM_W / 2, 220, t, 6403, { size: 24, at: 0.2 });
    drawCardRow(ctx, [c("7", "D"), c("7", "C")], FILM_W / 2, 320, 92, 128, 6404, { gap: 100, reveal: pileU });

    const tries: { cards: CardArt[]; ok: boolean; label: string; at: number; x: number }[] = [
      { cards: [c("K", "S")], ok: false, label: "WRONG SHAPE", at: 4.4, x: 192 },
      { cards: [c("4", "H"), c("4", "S")], ok: false, label: "TOO LOW", at: 6.2, x: 484 },
      { cards: [c("3", "C"), c("3", "H"), c("3", "S")], ok: false, label: "WRONG SHAPE", at: 8.0, x: 812 },
      { cards: [c("9", "H"), c("9", "S")], ok: true, label: "TAKES IT", at: 10.6, x: 1116 },
    ];
    for (const a of tries) {
      const lt = t - a.at;
      if (lt <= 0) continue;
      const u = clamp(lt / 0.55, 0, 1);
      drawCardRow(ctx, a.cards, a.x, 500, 64, 90, 6500 + Math.round(a.at * 10), {
        gap: 72,
        reveal: u,
        dim: a.ok ? undefined : a.cards.map(() => true),
      });
      if (a.ok) {
        drawTick(ctx, a.x, 588, 38, 6600, ramp(lt, 0.6, 1.1));
        drawRing(ctx, a.x, 500, 84, 76, 6601, { progress: ramp(lt, 0.8, 1.6) });
      } else {
        drawCross(ctx, a.x, 500, 74, 6700 + Math.round(a.at * 10), ramp(lt, 0.5, 1.2));
      }
      note(ctx, a.label, a.x, 620 + (a.ok ? 34 : 0), lt, 6800 + Math.round(a.at * 10), {
        size: 21,
        at: 1.0,
        color: a.ok ? "#2f8a5c" : RED,
      });
    }

    const winT = t - 12.6;
    if (winT > 0) {
      drawArrow(ctx, [1116, 440], [FILM_W / 2 + 108, 378], 6901, { progress: ramp(winT, 0, 0.8), color: "#2f8a5c", bend: 0.2 });
    }
  },
};

// ---------------------------------------------------------------------------
// 7. The five-card ladder
// ---------------------------------------------------------------------------

const fiveCard: Scene = {
  id: "five",
  title: "Five-card hands",
  duration: 34,
  captions: [
    { at: 0.3, text: "Five-card hands have their own ranking. Weakest at the bottom." },
    { at: 3.6, text: "A straight: five ranks in a row, any suits." },
    { at: 8.0, text: "A flush: five cards of one suit." },
    { at: 12.2, text: "A full house: a triple and a pair." },
    { at: 16.4, text: "Four of a kind, plus any fifth card." },
    { at: 20.4, text: "And a straight flush — five in a row, all one suit — which beats everything." },
    { at: 25.4, text: "Two house rules: flushes are compared by suit first, then by rank." },
    { at: 29.4, text: "And straights never wrap around, so ace-two-three-four-five is not a straight." },
  ],
  draw(ctx, t) {
    heading(ctx, "THE FIVE-CARD LADDER", t, 7401, 78, 44);

    const rungs: { label: string; cards: CardArt[] }[] = [
      { label: "STRAIGHT", cards: [c("5", "C"), c("6", "D"), c("7", "S"), c("8", "H"), c("9", "C")] },
      { label: "FLUSH", cards: [c("3", "H"), c("7", "H"), c("9", "H"), c("J", "H"), c("K", "H")] },
      { label: "FULL HOUSE", cards: [c("8", "D"), c("8", "C"), c("8", "S"), c("Q", "H"), c("Q", "S")] },
      { label: "FOUR + ONE", cards: [c("J", "D"), c("J", "C"), c("J", "H"), c("J", "S"), c("6", "C")] },
      { label: "STRAIGHT FLUSH", cards: [c("9", "S"), c("10", "S"), c("J", "S"), c("Q", "S"), c("K", "S")] },
    ];

    for (let i = 0; i < rungs.length; i++) {
      const at = 2.6 + i * 4.1;
      const lt = t - at;
      if (lt <= 0) continue;
      const u = clamp(lt / 0.7, 0, 1);
      const y = 600 - i * 98;
      const x = 150 + i * 44;
      const seed = 7500 + i * 131;
      ctx.save();
      ctx.globalAlpha *= easeOut(u);
      scrap(ctx, x, y - 44, 610, 88, seed, { color: i === 4 ? "#f7e6c0" : "#f6ecd9", angle: srand(seed, 3) * 0.012, amp: 3.2 });
      inkText(ctx, rungs[i].label, x + 22, y + 10, 26, seed + 7, { color: i === 4 ? RED : INK, width: 2.6, progress: clamp(u * 1.6, 0, 1) });
      drawCardRow(ctx, rungs[i].cards, x + 452, y, 46, 64, seed + 11, { gap: 52, reveal: clamp((lt - 0.25) / 0.7, 0, 1) });
      inkText(ctx, String(i + 1), x - 26, y + 12, 30, seed + 13, { color: GOLD, width: 3.4, progress: u, align: "center" });
      ctx.restore();
      if (i > 0) {
        drawArrow(ctx, [x - 54, y + 78], [x - 54, y + 16], seed + 17, {
          progress: ramp(lt, 0.4, 1.0),
          color: GOLD,
          bend: 0.05,
          width: 2.6,
          head: 12,
        });
      }
    }
    note(ctx, "STRONGER", 96, 176, t, 7601, { size: 22, at: 19.0, color: RED });
    note(ctx, "WEAKER", 96, 636, t, 7602, { size: 22, at: 3.4, color: INK_SOFT });

    const ruleT = t - 24.8;
    if (ruleT > 0) {
      const a = ramp(ruleT, 0, 0.5) * window4(ruleT, 0, 0.5, 3.6, 4.4);
      ctx.save();
      ctx.globalAlpha *= a;
      scrap(ctx, 726, 92, 470, 150, 7701, { color: "#f2e3c4", angle: 0.018, amp: 4 });
      tape(ctx, 760, 96, 62, -0.42, 7702);
      note(ctx, "HOUSE RULE", 960, 132, ruleT, 7703, { size: 24, at: 0.2, color: RED });
      note(ctx, "FLUSH: SUIT FIRST,", 960, 172, ruleT, 7704, { size: 22, at: 0.5 });
      note(ctx, "THEN RANK", 960, 204, ruleT, 7705, { size: 22, at: 0.8 });
      ctx.restore();
    }

    const wrapT = t - 28.8;
    if (wrapT > 0) {
      const a = ramp(wrapT, 0, 0.5);
      ctx.save();
      ctx.globalAlpha *= a;
      scrap(ctx, 700, 92, 520, 176, 7801, { color: "#f2e3c4", angle: -0.012, amp: 4 });
      drawCardRow(ctx, [c("A", "D"), c("2", "C"), c("3", "S"), c("4", "H"), c("5", "C")], 940, 158, 42, 58, 7802, {
        gap: 48,
        reveal: ramp(wrapT, 0.2, 0.9),
      });
      drawCross(ctx, 940, 158, 118, 7803, ramp(wrapT, 1.0, 1.8));
      note(ctx, "STRAIGHTS DO NOT WRAP", 940, 236, wrapT, 7804, { size: 22, at: 1.4, color: RED });
      ctx.restore();
    }
  },
};

// ---------------------------------------------------------------------------
// 8. Passing and sweeping
// ---------------------------------------------------------------------------

const passing: Scene = {
  id: "passing",
  title: "Passing and sweeping",
  duration: 22,
  captions: [
    { at: 0.3, text: "If you cannot beat the pile — or would rather not spend the cards — you pass." },
    { at: 5.0, text: "Passing only skips this turn. You are back in as soon as somebody plays again." },
    { at: 10.2, text: "When everyone else passes in a row, the pile is swept away." },
    { at: 14.6, text: "Whoever played last then leads the next trick, with any shape they like." },
    { at: 18.6, text: "That is the moment to unload something awkward." },
  ],
  draw(ctx, t) {
    heading(ctx, "PASS, THEN SWEEP", t, 8401);

    // The pile sits, three players pass, then the table is cleared.
    const sweepAt = 10.6;
    const swept = clamp((t - sweepAt) / 1.1, 0, 1);
    const slide = easeOut(swept);
    ctx.save();
    ctx.globalAlpha *= 1 - clamp((swept - 0.55) / 0.45, 0, 1);
    ctx.translate(-slide * 430, -slide * 96);
    drawCardRow(ctx, [c("10", "H"), c("10", "S")], FILM_W / 2, 330, 92, 128, 8402, { gap: 100, reveal: clamp(t / 0.6, 0, 1) });
    if (swept > 0.05) drawWhoosh(ctx, FILM_W / 2 + 90, 330, 300, 70, 8403, 1 - swept);
    ctx.restore();

    const passers = [
      { x: 258, y: 470, at: 2.4 },
      { x: FILM_W / 2, y: 552, at: 4.6 },
      { x: 1022, y: 470, at: 7.0 },
    ];
    for (let i = 0; i < passers.length; i++) {
      const p = passers[i];
      const lt = t - p.at;
      if (lt <= 0) continue;
      const fade = swept > 0.3 ? 1 - clamp((swept - 0.3) / 0.5, 0, 1) : 1;
      drawStamp(ctx, "PASS", p.x, p.y, 34, 8500 + i * 37, {
        drop: ramp(lt, 0, 0.35),
        angle: srand(8500 + i, 3) * 0.24,
        alpha: fade,
      });
    }

    const sweepT = t - sweepAt;
    if (sweepT > 0.2) {
      labelScrap(ctx, "TABLE CLEARED", FILM_W / 2, 330, sweepT, 8601, { at: 0.5, size: 30, color: RED });
    }
    const leadT = t - 14.2;
    if (leadT > 0) {
      const u = ramp(leadT, 0, 0.6);
      note(ctx, "LAST TO PLAY LEADS ANYTHING", FILM_W / 2, 450, leadT, 8701, { size: 26, at: 0.1 });
      drawCardRow(ctx, [c("3", "C"), c("4", "D")], FILM_W / 2 - 210, 560, 66, 92, 8702, { gap: 74, reveal: u });
      drawCardRow(ctx, [c("6", "H"), c("6", "S"), c("6", "C")], FILM_W / 2 + 200, 560, 66, 92, 8703, {
        gap: 74,
        reveal: ramp(leadT, 0.5, 1.2),
      });
      inkText(ctx, "OR", FILM_W / 2, 574, 30, 8704, { align: "center", color: GOLD, width: 3.4, progress: ramp(leadT, 0.4, 0.9) });
    }
  },
};

// ---------------------------------------------------------------------------
// 9. Scoring
// ---------------------------------------------------------------------------

const scoring: Scene = {
  id: "scoring",
  title: "Chips and multipliers",
  duration: 26,
  captions: [
    { at: 0.3, text: "The round ends the instant one hand is empty." },
    { at: 3.4, text: "Everyone else pays a chip for every card they are still holding." },
    { at: 7.6, text: "And Hong Kong rules punish a hand you never got going." },
    { at: 10.6, text: "Eight or more cards left: the penalty doubles." },
    { at: 14.4, text: "Ten or more: it triples." },
    { at: 17.4, text: "All thirteen — you never played once — and it is four times." },
    { at: 21.6, text: "So spending your big cards early is not cowardice. It is arithmetic." },
  ],
  draw(ctx, t) {
    heading(ctx, "WHAT IT COSTS", t, 9401);

    const cols = [
      { name: "WINNER", left: 0, mult: "", at: 1.0, chips: 0 },
      { name: "3 LEFT", left: 3, mult: "×1", at: 2.8, chips: 3 },
      { name: "8 LEFT", left: 8, mult: "×2", at: 9.8, chips: 8 },
      { name: "13 LEFT", left: 13, mult: "×4", at: 16.6, chips: 13 },
    ];
    const stepX = 296;
    const x0 = FILM_W / 2 - ((cols.length - 1) * stepX) / 2;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const lt = t - col.at;
      if (lt <= 0) continue;
      const u = ramp(lt, 0, 0.6);
      const x = x0 + i * stepX;
      ctx.save();
      ctx.globalAlpha *= u;
      note(ctx, col.name, x, 208, lt, 9500 + i, { size: 24, at: 0 });
      if (col.left === 0) {
        labelScrap(ctx, "EMPTY HAND", x, 300, lt, 9600, { at: 0.2, size: 24, color: "#2f8a5c" });
        drawTick(ctx, x, 392, 54, 9601, ramp(lt, 0.5, 1.1));
        note(ctx, "PAYS NOTHING", x, 470, lt, 9602, { size: 22, at: 0.9, color: "#2f8a5c" });
      } else {
        drawFan(ctx, x, 300, Math.min(col.left, 9), 46, 64, 9700 + i * 31, {
          faceDown: true,
          arc: 0.3,
          spread: 104,
          reveal: ramp(lt, 0.1, 0.8),
        });
        drawChips(ctx, x, 560, Math.min(col.chips, 9), 9800 + i * 17, i === 3 ? RED : GOLD, ramp(lt, 0.4, 1.1));
        note(ctx, String(col.left) + " CARDS", x, 606, lt, 9900 + i, { size: 22, at: 0.7 });
        inkText(ctx, col.mult, x, 668, 40, 9950 + i, {
          align: "center",
          color: i >= 2 ? RED : INK,
          width: 4.4,
          progress: ramp(lt, 0.9, 1.5),
        });
      }
      ctx.restore();
    }

    const tenT = t - 13.8;
    if (tenT > 0) {
      const a = ramp(tenT, 0, 0.5) * window4(tenT, 0, 0.5, 2.8, 3.6);
      ctx.save();
      ctx.globalAlpha *= a;
      labelScrap(ctx, "10 OR MORE = ×3", FILM_W / 2, 132, tenT, 9970, { at: 0.1, size: 26, color: RED, angle: 0.02 });
      ctx.restore();
    }
  },
};

// ---------------------------------------------------------------------------
// 10. Playing together
// ---------------------------------------------------------------------------

const together: Scene = {
  id: "together",
  title: "Playing with people",
  duration: 20,
  captions: [
    { at: 0.3, text: "You can play this alone against three machines, in one browser tab." },
    { at: 4.2, text: "Or put a tablet in the middle of a real table: it becomes the table." },
    { at: 8.6, text: "Each seat shows a QR code. Scan it and your phone becomes your hand." },
    { at: 13.4, text: "The tablet holds the pile and the scores; nobody sees anyone else's cards." },
    { at: 17.0, text: "Any seat nobody claims is played by the machine, so three friends is plenty." },
  ],
  draw(ctx, t) {
    heading(ctx, "OR ROUND A REAL TABLE", t, 10401);

    drawFelt(ctx, FILM_W / 2, 404, 392, 210, 10402, ramp(t, 0.2, 1.0));

    const tabletP = ramp(t - 3.8, 0, 0.8);
    if (tabletP > 0) {
      ctx.save();
      ctx.globalAlpha *= tabletP;
      drawTablet(ctx, FILM_W / 2, 396, 320, 10500, { angle: -0.02 });
      drawCardRow(ctx, [c("Q", "H"), c("Q", "S")], FILM_W / 2, 382, 48, 67, 10501, { gap: 58, reveal: ramp(t - 4.6, 0, 0.6) });
      note(ctx, "THE TABLE", FILM_W / 2, 320, t - 3.8, 10502, { size: 22, at: 0.9, color: "#e8e2d2" });
      ctx.restore();
    }

    const phones: { x: number; y: number; angle: number; at: number; label: string }[] = [
      { x: 232, y: 376, angle: -0.16, at: 8.2, label: "1" },
      { x: FILM_W / 2 - 4, y: 598, angle: 0.03, at: 9.0, label: "2" },
      { x: 1048, y: 376, angle: 0.17, at: 9.8, label: "3" },
    ];
    for (let i = 0; i < phones.length; i++) {
      const ph = phones[i];
      const lt = t - ph.at;
      if (lt <= 0) continue;
      const u = pop(ramp(lt, 0, 0.55));
      ctx.save();
      ctx.globalAlpha *= clamp(u * 1.3, 0, 1);
      const pw = (ph.y > 500 ? 92 : 112) * Math.min(1, u);
      drawPhone(ctx, ph.x, ph.y, pw, 10600 + i * 53, { angle: ph.angle, label: "SEAT " + ph.label, cards: 5 });
      ctx.restore();
      if (lt > 0.6) {
        const side = ph.x < FILM_W / 2 - 40 ? -1 : ph.x > FILM_W / 2 + 40 ? 1 : 0;
        const from: Pt = side === 0 ? [ph.x + 70, ph.y - 96] : [ph.x - side * 74, ph.y];
        const to: Pt = side === 0 ? [FILM_W / 2 + 132, 500] : [FILM_W / 2 + side * 176, 396];
        drawArrow(ctx, from, to, 10700 + i, { progress: ramp(lt, 0.6, 1.4), color: GOLD, bend: 0.14, width: 2.4 });
      }
    }

    const qrT = t - 7.4;
    if (qrT > 0) {
      const a = ramp(qrT, 0, 0.5) * window4(qrT, 0, 0.5, 5.2, 6.2);
      ctx.save();
      ctx.globalAlpha *= a;
      scrap(ctx, 78, 92, 258, 226, 10800, { color: "#f7edd8", angle: -0.03, amp: 4 });
      tape(ctx, 100, 96, 56, -0.5, 10801);
      drawQr(ctx, 118, 122, 128, 10802, ramp(qrT, 0.2, 0.9));
      note(ctx, "SCAN YOUR", 272, 156, qrT, 10803, { size: 20, at: 0.5 });
      note(ctx, "OWN SEAT", 272, 184, qrT, 10804, { size: 20, at: 0.7 });
      note(ctx, "NO APP,", 272, 226, qrT, 10805, { size: 20, at: 1.0, color: INK_SOFT });
      note(ctx, "NO LOGIN", 272, 254, qrT, 10806, { size: 20, at: 1.2, color: INK_SOFT });
      ctx.restore();
    }

    const aiT = t - 16.4;
    if (aiT > 0) {
      labelScrap(ctx, "EMPTY SEATS PLAY THEMSELVES", FILM_W / 2, 170, aiT, 10900, { at: 0.1, size: 26, color: INK, angle: 0.01 });
    }
  },
};

// ---------------------------------------------------------------------------
// 11. Outro
// ---------------------------------------------------------------------------

const outro: Scene = {
  id: "outro",
  title: "Your turn",
  duration: 14,
  captions: [
    { at: 0.3, text: "That is the whole game: lead a shape, beat it or pass, empty your hand." },
    { at: 5.0, text: "The rules panel has every detail, and the hint button will always find you a legal play." },
    { at: 9.6, text: "Deal yourself in." },
  ],
  draw(ctx, t) {
    const fan = ramp(t, 0.2, 1.4);
    drawFan(ctx, FILM_W / 2, 468, 13, 96, 134, 11400, {
      arc: 0.2,
      spread: 620,
      reveal: fan,
      cards: [
        c("3", "D"),
        c("4", "C"),
        c("5", "H"),
        c("7", "S"),
        c("8", "D"),
        c("9", "C"),
        c("10", "H"),
        c("J", "S"),
        c("Q", "D"),
        c("K", "C"),
        c("A", "H"),
        c("2", "S"),
        c("6", "D"),
      ],
    });

    inkText(ctx, "YOUR SEAT IS WARM", FILM_W / 2, 210, 72, 11500, {
      align: "center",
      color: INK,
      width: 8,
      progress: ramp(t, 1.4, 3.2),
      jitter: 0.045,
    });
    note(ctx, "PRESS PLAY AND FIND OUT", FILM_W / 2, 272, t, 11501, { size: 30, at: 3.4, color: GOLD });

    const sp = window4(t, 4.0, 4.6, 12.2, 13.4);
    drawSparkle(ctx, 300, 250, 36, 11600, sp);
    drawSparkle(ctx, 986, 214, 30, 11601, sp * 0.85);
    drawSparkle(ctx, 200, 430, 26, 11602, sp * 0.7);
    drawSparkle(ctx, 1090, 420, 32, 11603, sp * 0.8);

    const arrowT = t - 8.6;
    if (arrowT > 0) {
      note(ctx, "THE PLAY BUTTON IS RIGHT BELOW", FILM_W / 2 + 244, 600, arrowT, 11701, { size: 22, at: 0.4, color: RED });
      drawArrow(ctx, [FILM_W / 2 + 244, 622], [FILM_W / 2 + 150, 684], 11700, {
        progress: ramp(arrowT, 0.5, 1.4),
        color: RED,
        bend: -0.18,
        width: 4,
      });
    }
  },
};

export const SCENES: Scene[] = [title, deal, ranks, suits, shapes, beating, fiveCard, passing, scoring, together, outro];
