"use client";

import { CardBackSvg, CardFaceSvg } from "@/components/CardFace";
import type { Card } from "@/lib/cards";
import { RANKS, SUITS, SUIT_NAME } from "@/lib/cards";

interface CardViewProps {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  /** Deal-in animation order; also used to stagger the pile. */
  index?: number;
  /** Seat the card was played from, so it flies in from that direction. */
  from?: number;
  onClick?: (card: Card) => void;
}

/** Direction each seat throws its cards into the middle of the table. */
const FLY_FROM: Record<number, [string, string]> = {
  0: ["0px", "240px"],
  1: ["-280px", "-60px"],
  2: ["0px", "-180px"],
  3: ["280px", "-60px"],
};

export function CardView({ card, selected = false, disabled = false, index = 0, from, onClick }: CardViewProps) {
  const label = `${RANKS[card.rank]} of ${SUIT_NAME[SUITS[card.suit]]}`;
  const style: React.CSSProperties & Record<string, string | number> = {
    "--i": index,
    // A little scatter so a played set does not look mechanically aligned.
    "--tilt": `${((index % 3) - 1) * 2.5}deg`,
  };
  if (from !== undefined) {
    const [x, y] = FLY_FROM[from] ?? FLY_FROM[2];
    style["--from-x"] = x;
    style["--from-y"] = y;
  }

  const className = ["card", selected ? "is-selected" : "", onClick ? "is-clickable" : ""]
    .filter(Boolean)
    .join(" ");

  if (!onClick) {
    return (
      <div className={className} style={style} role="img" aria-label={label}>
        <CardFaceSvg card={card} />
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label}
      onClick={() => onClick(card)}
    >
      <CardFaceSvg card={card} />
    </button>
  );
}

export function CardBack({ count }: { count: number }) {
  const shown = Math.min(count, 8);
  return (
    <div className="card-back-stack" aria-label={`${count} cards in hand`}>
      {Array.from({ length: shown }, (_, i) => (
        <div key={i} className="card-back" style={{ "--i": i } as React.CSSProperties}>
          <CardBackSvg />
        </div>
      ))}
      <span className="card-back-stack__count">{count}</span>
    </div>
  );
}
