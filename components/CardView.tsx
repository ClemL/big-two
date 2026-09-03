"use client";

import type { Card } from "@/lib/cards";
import { RANKS, SUITS, SUIT_SYMBOL, isRed } from "@/lib/cards";

interface CardViewProps {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
  onClick?: (card: Card) => void;
}

export function CardView({ card, selected = false, disabled = false, size = "md", onClick }: CardViewProps) {
  const rank = RANKS[card.rank];
  const suit = SUIT_SYMBOL[SUITS[card.suit]];
  const className = [
    "card",
    `card--${size}`,
    isRed(card) ? "card--red" : "card--black",
    selected ? "is-selected" : "",
    onClick ? "is-clickable" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!onClick) {
    return (
      <div className={className} aria-label={`${rank}${suit}`}>
        <span className="card__corner">
          <span className="card__rank">{rank}</span>
          <span className="card__suit">{suit}</span>
        </span>
        <span className="card__pip">{suit}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${rank} of ${SUITS[card.suit]}`}
      onClick={() => onClick(card)}
    >
      <span className="card__corner">
        <span className="card__rank">{rank}</span>
        <span className="card__suit">{suit}</span>
      </span>
      <span className="card__pip">{suit}</span>
    </button>
  );
}

export function CardBack({ count }: { count: number }) {
  const shown = Math.min(count, 8);
  return (
    <div className="card-back-stack" aria-label={`${count} cards in hand`}>
      {Array.from({ length: shown }, (_, i) => (
        <div key={i} className="card-back" />
      ))}
      <span className="card-back-stack__count">{count}</span>
    </div>
  );
}
