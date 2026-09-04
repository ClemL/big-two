"use client";

import type { ReactNode } from "react";
import { CardView } from "@/components/CardView";
import type { Card } from "@/lib/cards";
import type { Combo } from "@/lib/combos";
import { comboName } from "@/lib/combos";

/**
 * The phone layout used while a tablet is acting as the table.
 *
 * Everything shared — seats, scores, the pile, the log — is on the tablet in
 * front of the players, so this is stripped to the two things a phone has to
 * carry: your hand and your actions. The one concession is a single line
 * naming what is on the table, because choosing cards without it means looking
 * up from your hand on every turn.
 */
export function PocketView({
  roomLabel,
  seatLabel,
  status,
  message,
  toBeat,
  hand,
  handKey,
  selected,
  dimmed = [],
  canSelect,
  onToggleCard,
  actions,
  overlay,
}: {
  roomLabel: string;
  seatLabel: string;
  status: string;
  message?: string | null;
  toBeat: Combo | null;
  hand: Card[];
  handKey: string;
  selected: string[];
  dimmed?: string[];
  canSelect: boolean;
  onToggleCard: (card: Card) => void;
  actions: ReactNode;
  overlay?: ReactNode;
}) {
  return (
    <main className="app pocket">
      <header className="pocket__bar">
        <span className="pocket__seat">{seatLabel}</span>
        <span className="pocket__room">{roomLabel}</span>
      </header>

      <p className={`pocket__status ${message ? "has-message" : ""}`}>{message || status}</p>

      <p className="pocket__to-beat">
        {toBeat ? (
          <>
            To beat: <strong>{comboName(toBeat)}</strong>{" "}
            <span className="pocket__cards">
              {toBeat.cards.map((c) => c.id).join(" ")}
            </span>
          </>
        ) : (
          "Table is clear — lead anything legal"
        )}
      </p>

      <section className="hand" aria-label="Your hand" key={handKey}>
        {hand.map((card, i) => (
          <CardView
            key={card.id}
            card={card}
            index={i}
            selected={selected.includes(card.id)}
            dimmed={dimmed.includes(card.id)}
            disabled={!canSelect}
            onClick={onToggleCard}
          />
        ))}
      </section>

      <section className="actions actions--pocket">{actions}</section>
      {overlay}
    </main>
  );
}
