/**
 * Combination detection and comparison.
 *
 * Legal shapes: 1 card (single), 2 (pair), 3 (triple) and 5 (poker hands).
 * Four-card "bombs" are NOT a shape in the Hong Kong game — four of a kind is
 * only playable as a five-card hand with any fifth card attached.
 *
 * Five-card ranking (low -> high):
 *   straight < flush < full house < four of a kind + kicker < straight flush
 *
 * Tie-breaks inside a category (Hong Kong conventions):
 *   straight / straight flush : highest card, suit breaks ties
 *   flush                     : suit first, then card ranks from the top down
 *   full house                : rank of the triple
 *   four of a kind            : rank of the quad
 *
 * Straights run over the rank order 3..A,2 with no wrap-around, so the lowest
 * straight is 3-4-5-6-7 and the highest is J-Q-K-A-2. A-2-3-4-5 is not a
 * straight in this implementation.
 */

import type { Card } from "./cards.ts";
import { cardValue, compareCards } from "./cards.ts";

export type ComboType =
  | "single"
  | "pair"
  | "triple"
  | "straight"
  | "flush"
  | "fullHouse"
  | "fourOfAKind"
  | "straightFlush";

/** Relative strength of the five-card categories. */
export const FIVE_CARD_TIER: Record<string, number> = {
  straight: 0,
  flush: 1,
  fullHouse: 2,
  fourOfAKind: 3,
  straightFlush: 4,
};

export const COMBO_LABEL: Record<ComboType, string> = {
  single: "Single",
  pair: "Pair",
  triple: "Triple",
  straight: "Straight",
  flush: "Flush",
  fullHouse: "Full House",
  fourOfAKind: "Four of a Kind",
  straightFlush: "Straight Flush",
};

export interface Combo {
  type: ComboType;
  cards: Card[];
  size: number;
  /** 0 for shapes of size 1/2/3; five-card category rank otherwise. */
  tier: number;
  /** Comparison key inside the same size + tier. */
  key: number;
}

function ranksDescendingKey(cards: readonly Card[]): number {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  return ranks.reduce((acc, r) => acc * 13 + r, 0);
}

function isConsecutive(sortedRanks: readonly number[]): boolean {
  for (let i = 1; i < sortedRanks.length; i++) {
    if (sortedRanks[i] !== sortedRanks[i - 1] + 1) return false;
  }
  return true;
}

function combo(type: ComboType, cards: readonly Card[], key: number): Combo {
  const ordered = cards.slice().sort(compareCards);
  return {
    type,
    cards: ordered,
    size: ordered.length,
    tier: FIVE_CARD_TIER[type] ?? 0,
    key,
  };
}

/** Classify a set of cards, or return null when the shape is not playable. */
export function identify(cards: readonly Card[]): Combo | null {
  const n = cards.length;
  if (n === 0) return null;
  const sorted = cards.slice().sort(compareCards);
  const top = sorted[n - 1];

  if (n === 1) return combo("single", sorted, cardValue(top));

  if (n === 2) {
    return sorted[0].rank === sorted[1].rank ? combo("pair", sorted, cardValue(top)) : null;
  }

  if (n === 3) {
    const same = sorted[0].rank === sorted[1].rank && sorted[1].rank === sorted[2].rank;
    return same ? combo("triple", sorted, sorted[0].rank) : null;
  }

  if (n !== 5) return null;

  const ranks = sorted.map((c) => c.rank);
  const uniqueRanks = Array.from(new Set(ranks)).sort((a, b) => a - b);
  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);
  const isStraight = uniqueRanks.length === 5 && isConsecutive(uniqueRanks);

  if (isStraight && isFlush) return combo("straightFlush", sorted, cardValue(top));
  if (isStraight) return combo("straight", sorted, cardValue(top));
  if (isFlush) return combo("flush", sorted, sorted[0].suit * 1e6 + ranksDescendingKey(sorted));

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const quad = [...counts.entries()].find(([, c]) => c === 4);
  if (quad) return combo("fourOfAKind", sorted, quad[0]);
  const triple = [...counts.entries()].find(([, c]) => c === 3);
  const pair = [...counts.entries()].find(([, c]) => c === 2);
  if (triple && pair) return combo("fullHouse", sorted, triple[0]);

  return null;
}

export function isValid(cards: readonly Card[]): boolean {
  return identify(cards) !== null;
}

/** True when `candidate` legally beats `current` (same shape, higher value). */
export function beats(candidate: Combo, current: Combo | null): boolean {
  if (!current) return true;
  if (candidate.size !== current.size) return false;
  if (candidate.size === 5 && candidate.tier !== current.tier) return candidate.tier > current.tier;
  return candidate.key > current.key;
}

/** Ascending strength order used for sorting and for the "weakest first" AI. */
export function compareCombos(a: Combo, b: Combo): number {
  return a.size - b.size || a.tier - b.tier || a.key - b.key;
}

function* subsets(cards: readonly Card[], size: number): Generator<Card[]> {
  const idx = Array.from({ length: size }, (_, i) => i);
  const n = cards.length;
  if (n < size) return;
  while (true) {
    yield idx.map((i) => cards[i]);
    let i = size - 1;
    while (i >= 0 && idx[i] === n - size + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
  }
}

/** Every legally shaped combination that can be formed from a hand. */
export function enumerateCombos(hand: readonly Card[]): Combo[] {
  const out: Combo[] = [];
  for (const size of [1, 2, 3, 5]) {
    for (const subset of subsets(hand, size)) {
      const c = identify(subset);
      if (c) out.push(c);
    }
  }
  return out;
}

export interface MoveOptions {
  /** Combination currently on the table; null means the player is leading. */
  current: Combo | null;
  /** Card id that the play must contain (3♦ on the opening play of a round). */
  mustInclude?: string | null;
}

/** All plays a hand can legally make against the table. */
export function legalMoves(hand: readonly Card[], options: MoveOptions): Combo[] {
  const { current, mustInclude } = options;
  return enumerateCombos(hand)
    .filter((c) => beats(c, current))
    .filter((c) => !mustInclude || c.cards.some((card) => card.id === mustInclude))
    .sort(compareCombos);
}

export function comboName(c: Combo): string {
  return COMBO_LABEL[c.type];
}
