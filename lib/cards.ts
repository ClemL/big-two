/**
 * Card primitives for Hong Kong style Big Two (鋤大弟).
 *
 * Rank order (low -> high):  3 4 5 6 7 8 9 10 J Q K A 2
 * Suit order (low -> high):  Diamonds < Clubs < Hearts < Spades
 *
 * Every card therefore has a unique total order value, which is what makes
 * single-card comparisons unambiguous in the Hong Kong ruleset.
 */

export const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"] as const;
export const SUITS = ["D", "C", "H", "S"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export const SUIT_SYMBOL: Record<Suit, string> = { D: "♦", C: "♣", H: "♥", S: "♠" };
export const SUIT_NAME: Record<Suit, string> = {
  D: "Diamonds",
  C: "Clubs",
  H: "Hearts",
  S: "Spades",
};

export interface Card {
  /** Stable identifier, e.g. "3D", "10H", "2S". */
  id: string;
  /** Index into RANKS: 0 = "3" ... 12 = "2". */
  rank: number;
  /** Index into SUITS: 0 = Diamonds ... 3 = Spades. */
  suit: number;
}

export const THREE_OF_DIAMONDS = "3D";

export function makeCard(rank: number, suit: number): Card {
  return { id: `${RANKS[rank]}${SUITS[suit]}`, rank, suit };
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (let r = 0; r < RANKS.length; r++) {
    for (let s = 0; s < SUITS.length; s++) deck.push(makeCard(r, s));
  }
  return deck;
}

/** Total order of a single card: rank dominates, suit breaks ties. */
export function cardValue(card: Card): number {
  return card.rank * 4 + card.suit;
}

export function compareCards(a: Card, b: Card): number {
  return cardValue(a) - cardValue(b);
}

export function cardLabel(card: Card): string {
  return `${RANKS[card.rank]}${SUIT_SYMBOL[SUITS[card.suit]]}`;
}

export function isRed(card: Card): boolean {
  return SUITS[card.suit] === "D" || SUITS[card.suit] === "H";
}

/** Deterministic PRNG so rounds can be replayed and unit tested. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type SortMode = "rank" | "suit";

export function sortHand(cards: readonly Card[], mode: SortMode = "rank"): Card[] {
  const out = cards.slice();
  if (mode === "rank") out.sort(compareCards);
  else out.sort((a, b) => a.suit - b.suit || a.rank - b.rank);
  return out;
}

export function deal(rng: () => number): Card[][] {
  const deck = shuffle(makeDeck(), rng);
  const hands: Card[][] = [[], [], [], []];
  deck.forEach((card, i) => hands[i % 4].push(card));
  return hands.map((hand) => sortHand(hand, "rank"));
}

/** Index of the player holding 3♦ — that player leads the round. */
export function findStartingPlayer(hands: readonly Card[][]): number {
  for (let i = 0; i < hands.length; i++) {
    if (hands[i].some((c) => c.id === THREE_OF_DIAMONDS)) return i;
  }
  return 0;
}
