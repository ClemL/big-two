/**
 * Hong Kong scoring. Losers pay one chip per card left in hand, with the
 * classic penalty multipliers for being caught holding a big hand:
 *
 *   1-7 cards  : x1
 *   8-9 cards  : x2
 *   10-12 cards: x3
 *   13 cards   : x4  (never played a single card all round)
 *
 * The winner collects the sum of everybody else's penalties.
 */

export function penaltyMultiplier(cardsLeft: number): number {
  if (cardsLeft >= 13) return 4;
  if (cardsLeft >= 10) return 3;
  if (cardsLeft >= 8) return 2;
  return 1;
}

export function penaltyFor(cardsLeft: number): number {
  return cardsLeft * penaltyMultiplier(cardsLeft);
}

/** Per-round chip deltas: negative for losers, positive for the winner. */
export function roundDeltas(cardsLeft: readonly number[], winner: number): number[] {
  const deltas = cardsLeft.map((n, i) => (i === winner ? 0 : -penaltyFor(n)));
  const pot = deltas.reduce((sum, d) => sum - d, 0);
  deltas[winner] = pot;
  return deltas;
}
