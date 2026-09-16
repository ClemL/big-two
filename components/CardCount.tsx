"use client";

/**
 * How many cards a seat is holding, as a shape rather than a number.
 *
 * "11 cards" and "2 cards" read the same at a glance, and the whole game is
 * deciding who is close to going out. A row of ticks that visibly shortens says
 * it without being read, and the last few are coloured because that is the
 * moment the table has to react to.
 */

const FULL_HAND = 13;

export function CardCount({
  count,
  label = true,
}: {
  count: number;
  /** Set false where a number already sits beside it. */
  label?: boolean;
}) {
  const level = count <= 1 ? "critical" : count <= 3 ? "warning" : "normal";
  return (
    <span
      className={`count count--${level}`}
      role="img"
      aria-label={`${count} card${count === 1 ? "" : "s"} left`}
    >
      <span className="count__ticks" aria-hidden="true">
        {Array.from({ length: FULL_HAND }, (_, i) => (
          <span key={i} className={`count__tick ${i < count ? "is-held" : ""}`} />
        ))}
      </span>
      {label ? (
        <span className="count__n" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </span>
  );
}
