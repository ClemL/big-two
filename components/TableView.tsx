"use client";

import type { ReactNode } from "react";
import { CardBack, CardView } from "@/components/CardView";
import type { Card } from "@/lib/cards";
import type { Combo } from "@/lib/combos";
import { comboName } from "@/lib/combos";
import type { LogEntry } from "@/lib/engine";

/**
 * The table layout, with no game logic in it.
 *
 * Single-player builds these props from its local `GameState`; the online
 * table builds them from the redacted view the server sends. Seats arrive
 * already rotated so that the viewer is always at the bottom.
 */

export interface OpponentSeat {
  key: number;
  name: string;
  cards: number;
  isTurn: boolean;
  badges: { label: string; muted?: boolean }[];
}

export interface ScoreRow {
  key: number;
  name: string;
  cards: number;
  chips: number;
  isActive: boolean;
  isWinner: boolean;
  isYou: boolean;
}

export interface PreviousPlay {
  key: string;
  combo: Combo;
  playerName: string;
}

export interface TableViewProps {
  subtitle: string;
  controls: ReactNode;
  scoreboard: ScoreRow[];
  roundLabel: string;
  /** Exactly three, ordered left, top, right. */
  opponents: OpponentSeat[];
  pile: { combo: Combo; playerName: string; fromPosition: number } | null;
  /** The plays before the current one, oldest first, shown beside the pile. */
  previousPlays?: PreviousPlay[];
  clearTableLeader: string;
  status: string;
  message?: string | null;
  hand: Card[];
  /** Changing this replays the deal animation. */
  handKey: string;
  selected: string[];
  canSelect: boolean;
  onToggleCard: (card: Card) => void;
  actions: ReactNode;
  log: LogEntry[];
  overlay?: ReactNode;
}

const SEAT_CLASSES = ["seat seat--left", "seat seat--top", "seat seat--right"];

export function TableView({
  subtitle,
  controls,
  scoreboard,
  roundLabel,
  opponents,
  pile,
  previousPlays = [],
  clearTableLeader,
  status,
  message,
  hand,
  handKey,
  selected,
  canSelect,
  onToggleCard,
  actions,
  log,
  overlay,
}: TableViewProps) {
  return (
    <main className="app">
      <header className="topbar">
        <div className="topbar__title">
          <h1>Big Two</h1>
          <span className="topbar__sub">{subtitle}</span>
        </div>
        <div className="topbar__controls">{controls}</div>
      </header>

      <section className="scoreboard" aria-label="Scores">
        {scoreboard.map((row) => (
          <div
            key={row.key}
            className={[
              "scoreboard__row",
              row.isActive ? "is-active" : "",
              row.isWinner ? "is-winner" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="scoreboard__name">
              {row.name}
              {row.isYou ? <span className="scoreboard__you"> (you)</span> : null}
            </span>
            <span className="scoreboard__cards">
              {row.cards} card{row.cards === 1 ? "" : "s"}
            </span>
            <span className={`scoreboard__chips ${row.chips < 0 ? "is-negative" : ""}`}>
              {row.chips > 0 ? `+${row.chips}` : row.chips}
            </span>
          </div>
        ))}
        <div className="scoreboard__round">{roundLabel}</div>
      </section>

      <section className="table">
        {opponents.map((seat, i) => (
          <div key={seat.key} className={`${SEAT_CLASSES[i]} ${seat.isTurn ? "is-turn" : ""}`}>
            <div className="seat__name">
              {seat.name}
              {seat.badges.map((badge) => (
                <span
                  key={badge.label}
                  className={`seat__badge ${badge.muted ? "seat__badge--muted" : ""}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
            <CardBack count={seat.cards} />
          </div>
        ))}

        <div className="pile">
          {previousPlays.length > 0 ? (
            /* Keyed on the newest entry so the whole strip slides across when a
               play lands and the old pile joins the history. */
            <div className="pile__history" key={previousPlays[previousPlays.length - 1].key}>
              {previousPlays.map((play) => (
                <div className="pile__history-entry" key={play.key}>
                  <span className="pile__history-who">{play.playerName}</span>
                  <div className="pile__history-cards">
                    {play.combo.cards.map((card) => (
                      <CardView key={card.id} card={card} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="pile__current">
            {pile ? (
              <>
                <div className="pile__label">
                  {pile.playerName} · {comboName(pile.combo)}
                </div>
                {/* Keyed on the play so a new one remounts and replays the animation. */}
                <div className="pile__cards" key={pile.combo.cards.map((c) => c.id).join("-")}>
                  {pile.combo.cards.map((card, i) => (
                    <CardView key={card.id} card={card} index={i} from={pile.fromPosition} />
                  ))}
                </div>
              </>
            ) : (
              <div className="pile__empty">
                Table is clear
                <span>{clearTableLeader} leads</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="status" role="status">
        <span>{status}</span>
        {message ? <span className="status__message">{message}</span> : null}
      </section>

      <section className="hand" aria-label="Your hand" key={handKey}>
        {hand.map((card, i) => (
          <CardView
            key={card.id}
            card={card}
            index={i}
            selected={selected.includes(card.id)}
            disabled={!canSelect}
            onClick={onToggleCard}
          />
        ))}
      </section>

      <section className="actions">{actions}</section>

      <section className="log" aria-label="Play history">
        {log
          .slice(-6)
          .reverse()
          .map((entry, i) => (
            <div key={`${log.length - i}`} className={`log__line log__line--${entry.kind}`}>
              {entry.text}
            </div>
          ))}
      </section>

      {overlay}
    </main>
  );
}

/** Round summary, shared by both tables. */
export function RoundSummary({
  rows,
  action,
}: {
  rows: { key: number; name: string; cards: number; delta: number; total: number; isWinner: boolean }[];
  action: ReactNode;
}) {
  return (
    <>
      <table className="results">
        <thead>
          <tr>
            <th>Player</th>
            <th>Cards left</th>
            <th>Round</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={row.isWinner ? "is-winner" : ""}>
              <td>{row.name}</td>
              <td>{row.cards}</td>
              <td className={row.delta < 0 ? "is-negative" : ""}>
                {row.delta > 0 ? `+${row.delta}` : row.delta}
              </td>
              <td>{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {action}
    </>
  );
}
