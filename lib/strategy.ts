/**
 * Hand planning for the competitive opponent.
 *
 * The question that drives good Big Two play is "how many turns do I still
 * need to shed this hand?". That is an exact-cover problem over the legal
 * combinations a hand contains, and with at most 13 cards it is small enough to
 * solve exactly with a bitmask DP rather than a greedy approximation:
 *
 *   best[mask] = 1 + min over combos c ⊆ mask of best[mask \ c]
 *
 * Pinning each step to the lowest remaining card removes the permutations of
 * the same partition, which is what keeps the search cheap.
 */

import type { Card } from "./cards.ts";
import type { Combo } from "./combos.ts";
import { compareCombos, enumerateCombos } from "./combos.ts";

export interface HandPlan {
  /** Fewest plays needed to empty the hand. */
  plays: number;
  /** One partition achieving that count, weakest group first. */
  groups: Combo[];
}

const EMPTY_PLAN: HandPlan = { plays: 0, groups: [] };
const CACHE_LIMIT = 4096;
const cache = new Map<string, HandPlan>();

function handKey(hand: readonly Card[]): string {
  return hand
    .map((c) => c.id)
    .sort()
    .join(",");
}

export function planFor(hand: readonly Card[]): HandPlan {
  if (hand.length === 0) return EMPTY_PLAN;
  const key = handKey(hand);
  const cached = cache.get(key);
  if (cached) return cached;

  const cards = hand.slice();
  const position = new Map(cards.map((card, i) => [card.id, i]));
  const combos = enumerateCombos(cards);
  const masks = combos.map((combo) =>
    combo.cards.reduce((mask, card) => mask | (1 << position.get(card.id)!), 0),
  );

  const full = (1 << cards.length) - 1;
  const best = new Int8Array(full + 1).fill(-1);
  const chosen = new Int16Array(full + 1).fill(-1);
  best[0] = 0;

  for (let mask = 1; mask <= full; mask++) {
    // Every partition of `mask` covers its lowest card in exactly one group,
    // so only those groups need to be considered here.
    const lowest = mask & -mask;
    let bestCount = 127;
    let bestCombo = -1;
    for (let i = 0; i < masks.length; i++) {
      const combo = masks[i];
      if ((combo & lowest) === 0) continue;
      if ((combo & mask) !== combo) continue;
      const rest = best[mask ^ combo];
      if (rest >= 0 && rest + 1 < bestCount) {
        bestCount = rest + 1;
        bestCombo = i;
      }
    }
    best[mask] = bestCombo === -1 ? -1 : bestCount;
    chosen[mask] = bestCombo;
  }

  const groups: Combo[] = [];
  for (let mask = full; mask > 0; ) {
    const i = chosen[mask];
    if (i === -1) break;
    groups.push(combos[i]);
    mask ^= masks[i];
  }

  groups.sort(compareCombos);
  const plan: HandPlan = { plays: best[full], groups };
  // Positions repeat rarely, so the cache is a scratch pad, not a memo table.
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, plan);
  return plan;
}

/** Fewest plays needed to empty the hand. */
export function minPlays(hand: readonly Card[]): number {
  return planFor(hand).plays;
}

export function handWithout(hand: readonly Card[], combo: Combo): Card[] {
  const removed = new Set(combo.cards.map((c) => c.id));
  return hand.filter((card) => !removed.has(card.id));
}
