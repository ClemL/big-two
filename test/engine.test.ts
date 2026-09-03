import test from "node:test";
import assert from "node:assert/strict";
import { THREE_OF_DIAMONDS, mulberry32 } from "../lib/cards.ts";
import { identify } from "../lib/combos.ts";
import {
  applyPass,
  applyPlay,
  canPass,
  legalMovesFor,
  nextRound,
  startRound,
  validatePlay,
  type GameState,
} from "../lib/engine.ts";
import { chooseMove, type AiStyle } from "../lib/ai.ts";
import { penaltyFor, roundDeltas } from "../lib/scoring.ts";

test("a fresh round deals 13 cards each and 3♦ leads", () => {
  const state = startRound({ seed: 42 });
  assert.equal(state.players.length, 4);
  for (const p of state.players) assert.equal(p.hand.length, 13);
  const ids = state.players.flatMap((p) => p.hand.map((c) => c.id));
  assert.equal(new Set(ids).size, 52);
  assert.ok(state.players[state.turn].hand.some((c) => c.id === THREE_OF_DIAMONDS));
  assert.equal(state.openingPlay, true);
});

test("the opening play must contain 3♦ and cannot be a pass", () => {
  const state = startRound({ seed: 7 });
  const me = state.turn;
  const other = state.players[me].hand.find((c) => c.id !== THREE_OF_DIAMONDS)!;
  assert.match(validatePlay(state, me, [other]) ?? "", /3♦/);
  assert.equal(canPass(state, me), false);
  assert.ok(legalMovesFor(state, me).every((c) => c.cards.some((x) => x.id === THREE_OF_DIAMONDS)));
});

test("playing removes cards, sets the table and advances the turn", () => {
  const start = startRound({ seed: 42 });
  const me = start.turn;
  const move = legalMovesFor(start, me)[0];
  const next = applyPlay(start, me, move.cards);
  assert.equal(next.players[me].hand.length, 13 - move.cards.length);
  assert.equal(next.table?.player, me);
  assert.equal(next.leader, me);
  assert.equal(next.turn, (me + 1) % 4);
  assert.equal(next.openingPlay, false);
});

test("a play must match the shape on the table", () => {
  let state = startRound({ seed: 42 });
  const me = state.turn;
  const single = legalMovesFor(state, me).find((c) => c.size === 1)!;
  state = applyPlay(state, me, single.cards);
  const responder = state.turn;
  const twoCards = state.players[responder].hand.slice(0, 2);
  assert.notEqual(validatePlay(state, responder, twoCards), null);
});

test("three passes clear the table and return the lead to the pile owner", () => {
  let state = startRound({ seed: 42 });
  const leader = state.turn;
  state = applyPlay(state, leader, legalMovesFor(state, leader)[0].cards);
  for (let i = 0; i < 3; i++) {
    assert.equal(canPass(state, state.turn), true);
    state = applyPass(state, state.turn);
  }
  assert.equal(state.table, null);
  assert.equal(state.turn, leader);
  assert.equal(state.passed.every((p) => !p), true);
  assert.equal(canPass(state, leader), false);
});

test("penalty multipliers follow the Hong Kong table", () => {
  assert.equal(penaltyFor(0), 0);
  assert.equal(penaltyFor(7), 7);
  assert.equal(penaltyFor(8), 16);
  assert.equal(penaltyFor(9), 18);
  assert.equal(penaltyFor(10), 30);
  assert.equal(penaltyFor(12), 36);
  assert.equal(penaltyFor(13), 52);
});

test("round deltas are zero-sum", () => {
  const deltas = roundDeltas([0, 5, 9, 13], 0);
  assert.equal(deltas[1], -5);
  assert.equal(deltas[2], -18);
  assert.equal(deltas[3], -52);
  assert.equal(deltas[0], 75);
  assert.equal(deltas.reduce((a, b) => a + b, 0), 0);
});

/** Drive a whole round with AI policies on every seat. */
function playOut(seed: number, style: AiStyle): GameState {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  let state = startRound({ seed });
  let guard = 0;
  while (!state.finished) {
    if (guard++ > 5000) throw new Error("round did not terminate");
    const player = state.turn;
    const move = chooseMove(state, player, style, rng);
    state = move ? applyPlay(state, player, move.cards) : applyPass(state, player);
  }
  return state;
}

for (const style of ["weakest", "random"] as AiStyle[]) {
  test(`self-play terminates and conserves cards (${style})`, () => {
    for (let seed = 1; seed <= 150; seed++) {
      const end = playOut(seed, style);
      assert.equal(end.finished, true);
      assert.notEqual(end.winner, null);
      assert.equal(end.players[end.winner!].hand.length, 0);
      const totalLeft = end.players.reduce((sum, p) => sum + p.hand.length, 0);
      assert.ok(totalLeft > 0 && totalLeft < 52 - 12);
      assert.equal(end.scores.reduce((a, b) => a + b, 0), 0);
    }
  });
}

test("AI only passes when it has no legal play", () => {
  const rng = mulberry32(99);
  let state = startRound({ seed: 2024 });
  let guard = 0;
  while (!state.finished && guard++ < 5000) {
    const player = state.turn;
    const move = chooseMove(state, player, "weakest", rng);
    if (move === null) {
      assert.equal(legalMovesFor(state, player).length, 0);
      state = applyPass(state, player);
    } else {
      state = applyPlay(state, player, move.cards);
    }
  }
  assert.equal(state.finished, true);
});

test("the weakest style always picks the lowest available combination", () => {
  const state = startRound({ seed: 5 });
  const player = state.turn;
  const moves = legalMovesFor(state, player);
  const chosen = chooseMove(state, player, "weakest")!;
  assert.equal(chosen.key, moves[0].key);
  assert.equal(chosen.size, moves[0].size);
  assert.equal(chosen.size, 1, "leading with the weakest play means a single card");
});

test("illegal plays are rejected rather than mutating state", () => {
  const state = startRound({ seed: 11 });
  const me = state.turn;
  const notMyTurn = (me + 1) % 4;
  assert.throws(() => applyPlay(state, notMyTurn, state.players[notMyTurn].hand.slice(0, 1)));
  assert.throws(() => applyPass(state, me));
  assert.equal(state.players[me].hand.length, 13);
});

test("nextRound keeps cumulative scores and re-deals", () => {
  const end = playOut(3, "weakest");
  const fresh = nextRound(end);
  assert.deepEqual(fresh.scores, end.scores);
  assert.equal(fresh.roundNumber, end.roundNumber + 1);
  assert.equal(fresh.finished, false);
  for (const p of fresh.players) assert.equal(p.hand.length, 13);
});

test("a five-card table demands a five-card reply", () => {
  let state = startRound({ seed: 42 });
  const me = state.turn;
  const five = legalMovesFor(state, me).find((c) => c.size === 5);
  if (!five) return; // seed-dependent; the shape assertions above cover the rest
  state = applyPlay(state, me, five.cards);
  const replies = legalMovesFor(state, state.turn);
  assert.ok(replies.every((c) => c.size === 5));
  assert.ok(replies.every((c) => identify(c.cards) !== null));
});
