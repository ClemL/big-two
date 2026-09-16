"use client";

import type { ReactNode } from "react";
import { CardCount } from "@/components/CardCount";
import { HandView } from "@/components/HandView";
import type { Card } from "@/lib/cards";
import type { HandLayout } from "@/lib/handSettings";
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
  others,
  hand,
  handKey,
  layout = "fan",
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
  /** Everyone else at the table, in seat order from your left. */
  others: { key: number; name: string; cards: number; isTurn: boolean }[];
  hand: Card[];
  handKey: string;
  layout?: HandLayout;
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

      {/* The tablet shows the table, but not from where you are sitting — who is
          about to go out is the one thing worth repeating on the phone. */}
      <section className="pocket__others" aria-label="Cards left">
        {others.map((seat) => (
          <div key={seat.key} className={`pocket__other ${seat.isTurn ? "is-turn" : ""}`}>
            <span className="pocket__other-name">{seat.name}</span>
            <CardCount count={seat.cards} />
          </div>
        ))}
      </section>

      <HandView
        hand={hand}
        layout={layout}
        handKey={handKey}
        selected={selected}
        dimmed={dimmed}
        canSelect={canSelect}
        onToggleCard={onToggleCard}
      />

      <section className="actions actions--pocket">{actions}</section>
      {overlay}
    </main>
  );
}
