/**
 * Opponent policies.
 *
 *   weakest    — plays the lowest-quality legal combination available: smallest
 *                shape first, then the lowest category, then the lowest value.
 *   random     — picks uniformly at random among all legal plays.
 *   strategist — plans the hand into the fewest possible plays and protects
 *                that plan (see below).
 *
 * The first two never pass while they hold a legal play, which is deliberate.
 * The strategist is the exception: refusing to pass means spending a 2 to beat
 * a 5, and no opponent that does that can be called competitive.
 */

import type { Combo } from "./combos.ts";
import type { GameState } from "./engine.ts";
import { legalMovesFor } from "./engine.ts";
import { handWithout, minPlays } from "./strategy.ts";

export type AiStyle = "weakest" | "random" | "strategist";

export const AI_STYLE_LABEL: Record<AiStyle, string> = {
  weakest: "Lowest legal play",
  random: "Random legal play",
  strategist: "Competitive",
};

/** Opponent card counts, ignoring the player deciding. */
function opponentCardCounts(state: GameState, player: number): number[] {
  return state.players.filter((p) => p.index !== player).map((p) => p.hand.length);
}

interface ScoredMove {
  move: Combo;
  /** Plays still needed after making this move. */
  after: number;
}

/**
 * Play the hand as a plan rather than a pile of cards.
 *
 * A move is *efficient* when it consumes exactly one group of the optimal
 * partition — the hand still needs one fewer play afterwards. Anything else
 * breaks a group up and costs a turn later, which is what makes passing the
 * better option when nothing efficient is available.
 */
function chooseStrategic(state: GameState, player: number): Combo | null {
  const moves = legalMovesFor(state, player);
  if (moves.length === 0) return null;

  const hand = state.players[player].hand;
  const leading = state.table === null;
  const closestOpponent = Math.min(...opponentCardCounts(state, player));

  // Going out ends the round; nothing else is worth comparing against it.
  const finisher = moves.find((m) => m.cards.length === hand.length);
  if (finisher) return finisher;

  const baseline = minPlays(hand);
  const scored: ScoredMove[] = moves.map((move) => ({
    move,
    after: minPlays(handWithout(hand, move)),
  }));
  const efficient = scored.filter((s) => s.after === baseline - 1);

  if (leading) {
    const pool = efficient.length > 0 ? efficient : [leastDamaging(scored)];
    // An opponent down to one card can only answer a single, so lead a shape
    // they cannot legally beat.
    if (closestOpponent === 1) {
      const multi = pool.filter((s) => s.move.size > 1);
      if (multi.length > 0) return largestThenLowest(multi);
      // Only singles left: make them spend their last card on a high one.
      return pool[pool.length - 1].move;
    }
    return largestThenLowest(pool);
  }

  // Following: take the cheapest move that keeps the plan intact, and when
  // nothing does, the one that damages the plan least.
  //
  // Passing instead of breaking a group up was measured (bench/tournament.ts,
  // 1000 rounds head to head): it wins more rounds, 26.6% against 23.4%, but
  // loses on chips, -0.70 a round against +0.70, because the hands it holds on
  // to are caught by the penalty multipliers. Hong Kong scoring counts chips,
  // so this tier contests instead — which also keeps the never-pass rule that
  // both simpler styles follow.
  return efficient.length > 0 ? efficient[0].move : leastDamaging(scored).move;
}

/** Fewest plays left afterwards; ties go to the weakest combination. */
function leastDamaging(pool: ScoredMove[]): ScoredMove {
  return pool.reduce((best, candidate) => (candidate.after < best.after ? candidate : best));
}

/** Prefer shedding more cards; among equal sizes take the weakest combination. */
function largestThenLowest(pool: ScoredMove[]): Combo {
  return pool.reduce((best, candidate) =>
    candidate.move.size > best.move.size ? candidate : best,
  ).move;
}

/** Returns the combination to play, or null meaning "pass". */
export function chooseMove(
  state: GameState,
  player: number,
  style: AiStyle = "weakest",
  rng: () => number = Math.random,
): Combo | null {
  if (style === "strategist") {
    const move = chooseStrategic(state, player);
    // Leading is never a pass; the strategist should not produce one, but the
    // engine would throw rather than recover if it ever did.
    if (!move && state.table === null) return legalMovesFor(state, player)[0] ?? null;
    return move;
  }

  const moves = legalMovesFor(state, player);
  if (moves.length === 0) return null;
  if (style === "random") return moves[Math.floor(rng() * moves.length)];
  // legalMovesFor already returns ascending strength order.
  return moves[0];
}

/** The human player's hint button: the lowest legal play. */
export function suggestMove(state: GameState, player: number): Combo | null {
  const moves = legalMovesFor(state, player);
  return moves[0] ?? null;
}
