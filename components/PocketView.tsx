"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CardCount } from "@/components/CardCount";
import { CardView } from "@/components/CardView";
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
  seatName,
  onRename,
  justPlayed,
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
  /** Your current name, for the rename field. */
  seatName: string;
  onRename: (name: string) => void;
  /** The cards you last sent, shown briefly on their way to the table. */
  justPlayed: Card[] | null;
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
        <SeatName label={seatLabel} name={seatName} onRename={onRename} />
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

      {justPlayed ? (
        /* Keyed on the cards so replaying the same shape restarts the flight. */
        <div className="pocket__sent" key={justPlayed.map((c) => c.id).join("-")} aria-hidden="true">
          {justPlayed.map((card, i) => (
            <CardView key={card.id} card={card} index={i} />
          ))}
        </div>
      ) : null}

      <section className="actions actions--pocket">{actions}</section>
      {overlay}
    </main>
  );
}


/**
 * Your seat name, tappable to change it.
 *
 * On a phone there is nowhere else to put this: the lobby is behind you once
 * you are seated, and the name is what everyone else sees on the table.
 */
function SeatName({
  label,
  name,
  onRename,
}: {
  label: string;
  name: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setDraft(name);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="pocket__seat"
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        title="Change your name"
      >
        {label}
        <span className="pocket__seat-edit" aria-hidden="true">
          ✎
        </span>
      </button>
    );
  }

  return (
    <span className="pocket__rename">
      <input
        ref={input}
        value={draft}
        maxLength={16}
        aria-label="Your name"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
        onBlur={commit}
      />
      <button type="button" className="btn btn--tiny" onMouseDown={(e) => e.preventDefault()} onClick={commit}>
        Save
      </button>
    </span>
  );
}
