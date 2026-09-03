/**
 * Opponent policy.
 *
 * Both styles share one hard rule: an AI never passes while it holds a legal
 * play. It only passes when the table leaves it with no playable combination.
 *
 *   weakest — plays the lowest-quality legal combination available: smallest
 *             shape first, then the lowest category, then the lowest value.
 *             This dribbles low singles out and hoards the big cards.
 *   random  — picks uniformly at random among all legal plays.
 */

import type { Combo } from "./combos.ts";
import type { GameState } from "./engine.ts";
import { legalMovesFor } from "./engine.ts";

export type AiStyle = "weakest" | "random";

export const AI_STYLE_LABEL: Record<AiStyle, string> = {
  weakest: "Lowest legal play",
  random: "Random legal play",
};

/** Returns the combination to play, or null meaning "pass" (no legal play). */
export function chooseMove(
  state: GameState,
  player: number,
  style: AiStyle = "weakest",
  rng: () => number = Math.random,
): Combo | null {
  const moves = legalMovesFor(state, player);
  if (moves.length === 0) return null;
  if (style === "random") return moves[Math.floor(rng() * moves.length)];
  // legalMovesFor already returns ascending strength order.
  return moves[0];
}

/** Same policy, exposed as the human player's hint button. */
export function suggestMove(state: GameState, player: number): Combo | null {
  return chooseMove(state, player, "weakest");
}
