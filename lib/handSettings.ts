/**
 * How a player's own hand is laid out on their own device.
 *
 * Separate from `tableSettings.ts` on purpose: that file is the tablet in the
 * middle of the table, this is the phone in somebody's hand, and the two are
 * never the same device. Neither goes over the wire.
 */

export type HandLayout = "fan" | "arc" | "grouped";

export const HAND_LAYOUT_LABEL: Record<HandLayout, string> = {
  fan: "Fan",
  arc: "Arc",
  grouped: "Grouped by play",
};

export const HAND_LAYOUT_HINT: Record<HandLayout, string> = {
  fan: "One overlapping row, sorted.",
  arc: "The same row bent along a curve, as a hand sits in your fingers.",
  grouped: "Split into the fewest plays that empty the hand.",
};

export const DEFAULT_HAND_LAYOUT: HandLayout = "fan";

export const HAND_LAYOUT_KEY = "bigtwo_hand_layout";

const LAYOUTS: HandLayout[] = ["fan", "arc", "grouped"];

/**
 * Total by design: a stored value from an older release must not put a player
 * on an error screen mid-round. Anything unrecognised falls back to the fan.
 */
export function readHandLayout(stored: string | null): HandLayout {
  return LAYOUTS.includes(stored as HandLayout) ? (stored as HandLayout) : DEFAULT_HAND_LAYOUT;
}

/**
 * How far each card in an arc is turned, in degrees.
 *
 * The spread is capped rather than divided evenly: a two-card hand fanned
 * across the full sweep looks broken, and a thirteen-card hand turned as far
 * as a five-card one puts the end cards on their side.
 */
export function arcAngle(index: number, count: number, spread = 16): number {
  if (count < 2) return 0;
  const half = (count - 1) / 2;
  return ((index - half) / half) * Math.min(spread, count * 1.6);
}
