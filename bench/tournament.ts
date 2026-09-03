/**
 * Head-to-head self-play between the opponent styles.
 *
 * Seat assignment rotates with the seed so positional advantage (the 3♦ holder
 * leads) averages out. Run with: npm run bench
 */

import { mulberry32 } from "../lib/cards.ts";
import { applyPass, applyPlay, startRound, type GameState } from "../lib/engine.ts";
import { chooseMove, type AiStyle } from "../lib/ai.ts";

const ROUNDS = Number(process.argv[2] ?? 400);
const LINEUP: AiStyle[] = (process.env.LINEUP?.split(",") as AiStyle[] | undefined) ?? [
  "strategist",
  "weakest",
  "random",
  "weakest",
];

interface Tally {
  wins: number;
  chips: number;
  rounds: number;
  cardsLeft: number;
  passes: number;
  turns: number;
}

const tallies = new Map<AiStyle, Tally>();
for (const style of LINEUP) {
  if (!tallies.has(style)) {
    tallies.set(style, { wins: 0, chips: 0, rounds: 0, cardsLeft: 0, passes: 0, turns: 0 });
  }
}

function playRound(seed: number, seats: AiStyle[]): GameState {
  const rng = mulberry32(seed ^ 0x5bf03635);
  let state = startRound({ seed });
  let guard = 0;
  while (!state.finished) {
    if (guard++ > 5000) throw new Error(`round ${seed} did not terminate`);
    const player = state.turn;
    const tally = tallies.get(seats[player])!;
    tally.turns++;
    const move = chooseMove(state, player, seats[player], rng);
    if (move) {
      state = applyPlay(state, player, move.cards);
    } else {
      tally.passes++;
      state = applyPass(state, player);
    }
  }
  return state;
}

const started = Date.now();
for (let seed = 1; seed <= ROUNDS; seed++) {
  // Rotate the lineup so every style leads from every seat equally often.
  const offset = seed % 4;
  const seats = LINEUP.map((_, i) => LINEUP[(i + offset) % 4]);
  const end = playRound(seed, seats);
  end.players.forEach((p) => {
    const tally = tallies.get(seats[p.index])!;
    tally.rounds++;
    tally.chips += end.scores[p.index];
    tally.cardsLeft += p.hand.length;
    if (end.winner === p.index) tally.wins++;
  });
}

const seatsPerStyle = new Map<AiStyle, number>();
for (const style of LINEUP) seatsPerStyle.set(style, (seatsPerStyle.get(style) ?? 0) + 1);

console.log(`${ROUNDS} rounds, lineup ${LINEUP.join(" / ")} (${Date.now() - started}ms)\n`);
console.log("style        seats  win rate  expected  chips/round  cards left  pass rate");
for (const [style, t] of tallies) {
  const seats = seatsPerStyle.get(style)!;
  const winRate = (t.wins / t.rounds) * 100;
  console.log(
    [
      style.padEnd(12),
      String(seats).padStart(5),
      `${winRate.toFixed(1)}%`.padStart(9),
      `${(25).toFixed(1)}%`.padStart(9),
      (t.chips / ROUNDS).toFixed(2).padStart(12),
      (t.cardsLeft / t.rounds).toFixed(2).padStart(11),
      `${((t.passes / t.turns) * 100).toFixed(1)}%`.padStart(10),
    ].join(""),
  );
}
