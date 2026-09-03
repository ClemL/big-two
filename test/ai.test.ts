import test from "node:test";
import assert from "node:assert/strict";
import { RANKS, SUITS, makeCard, mulberry32, type Card } from "../lib/cards.ts";
import { identify } from "../lib/combos.ts";
import { applyPass, applyPlay, legalMovesFor, startRound, type GameState } from "../lib/engine.ts";
import { chooseMove, type AiStyle } from "../lib/ai.ts";
import { handWithout, minPlays, planFor } from "../lib/strategy.ts";

function hand(...ids: string[]): Card[] {
  return ids.map((id) => {
    const suit = SUITS.indexOf(id.slice(-1) as (typeof SUITS)[number]);
    const rank = RANKS.indexOf(id.slice(0, -1) as (typeof RANKS)[number]);
    assert.ok(rank >= 0 && suit >= 0, `bad card id ${id}`);
    return makeCard(rank, suit);
  });
}

test("a hand that is one combination needs one play", () => {
  assert.equal(minPlays(hand("3D", "4C", "5H", "6S", "7D")), 1);
  assert.equal(minPlays(hand("6D", "6C", "6H", "6S", "9D")), 1);
  assert.equal(minPlays(hand("4D", "4C", "4H", "9S", "9D")), 1);
  assert.equal(minPlays(hand("8H", "9H", "10H", "JH", "QH")), 1);
  assert.equal(minPlays(hand("KD", "KC")), 1);
});

test("unrelated cards need one play each", () => {
  assert.equal(minPlays(hand("3D", "5C", "7H")), 3);
  assert.equal(minPlays(hand("3D")), 1);
  assert.equal(minPlays([]), 0);
});

test("the planner finds the shortest partition, not a greedy one", () => {
  // Ten cards that pair up five ways, but split into two straight flushes.
  // A greedy pass that takes pairs first needs five plays; the optimum is two.
  const twoFlushes = hand("3D", "3C", "4D", "4C", "5D", "5C", "6D", "6C", "7D", "7C");
  assert.equal(minPlays(twoFlushes), 2);

  // Eight cards that split into a triple and a full house rather than three
  // groups of matching ranks.
  assert.equal(minPlays(hand("3D", "3C", "3H", "4S", "4D", "4C", "5H", "5S")), 2);

  // A flush here would strand four unmatched cards; four pairs plus the spare
  // is the shorter plan.
  assert.equal(minPlays(hand("3D", "4D", "5D", "6D", "8D", "3C", "4C", "5S", "6S")), 5);
});

test("a plan partitions the hand into legal combinations", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const state = startRound({ seed });
    for (const player of state.players) {
      const plan = planFor(player.hand);
      const covered = plan.groups.flatMap((g) => g.cards.map((c) => c.id));
      assert.equal(covered.length, player.hand.length, "every card is placed exactly once");
      assert.equal(new Set(covered).size, player.hand.length);
      assert.equal(plan.groups.length, plan.plays);
      for (const group of plan.groups) assert.notEqual(identify(group.cards), null);
      assert.ok(plan.plays >= 1 && plan.plays <= 13);
    }
  }
});

test("handWithout removes exactly the played cards", () => {
  const cards = hand("3D", "3C", "5H", "9S");
  const pair = identify(hand("3D", "3C"))!;
  assert.deepEqual(
    handWithout(cards, pair).map((c) => c.id),
    ["5H", "9S"],
  );
});

/** Drive a round with a style on each seat. */
function playRound(seed: number, seats: AiStyle[]): GameState {
  const rng = mulberry32(seed ^ 0x2545f491);
  let state = startRound({ seed });
  let guard = 0;
  while (!state.finished) {
    assert.ok(guard++ < 5000, "round terminates");
    const player = state.turn;
    const move = chooseMove(state, player, seats[player], rng);
    if (move === null) {
      // No style may pass while it holds a legal play, and no style may pass
      // while leading — the engine rejects that outright.
      assert.equal(legalMovesFor(state, player).length, 0);
      assert.notEqual(state.table, null);
      state = applyPass(state, player);
    } else {
      state = applyPlay(state, player, move.cards);
    }
  }
  return state;
}

test("the competitive style never passes while it holds a legal play", () => {
  for (let seed = 1; seed <= 30; seed++) {
    playRound(seed, ["strategist", "strategist", "weakest", "random"]);
  }
});

test("the competitive style beats the lowest-legal style on chips", () => {
  const seats: AiStyle[] = ["strategist", "weakest", "weakest", "weakest"];
  let wins = 0;
  let chips = 0;
  const rounds = 40;
  for (let seed = 1; seed <= rounds; seed++) {
    // Rotate so the competitive seat does not always sit in the same position.
    const rotated = seats.map((_, i) => seats[(i + (seed % 4)) % 4]);
    const seat = rotated.indexOf("strategist");
    const end = playRound(seed, rotated);
    if (end.winner === seat) wins++;
    chips += end.scores[seat];
  }
  // Measured around 42% and +8 chips a round over 60 rounds; the thresholds
  // are loose enough to absorb variance but tight enough to catch a regression
  // that makes the planner stop planning.
  assert.ok(wins / rounds > 0.3, `win rate ${(wins / rounds).toFixed(2)} should beat 25% baseline`);
  assert.ok(chips / rounds > 3, `chips per round ${(chips / rounds).toFixed(2)} should be clearly positive`);
});

test("a strategist that can go out does so immediately", () => {
  let state = startRound({ seed: 8 });
  // Hand-build an endgame: the strategist holds a pair it can dump to win.
  state = {
    ...state,
    turn: 1,
    table: { player: 0, combo: identify(hand("4D", "4C"))! },
    leader: 0,
    openingPlay: false,
    players: state.players.map((p) =>
      p.index === 1 ? { ...p, hand: hand("KD", "KC") } : p,
    ),
  };
  const move = chooseMove(state, 1, "strategist");
  assert.deepEqual(move?.cards.map((c) => c.id), ["KD", "KC"]);
});
