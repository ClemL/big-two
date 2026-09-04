"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CardView } from "@/components/CardView";
import { Modal } from "@/components/Modal";
import { comboName } from "@/lib/combos";
import * as sound from "@/lib/sound";
import type { PublicRoom } from "@/lib/room";

/**
 * The shared table: a tablet in the middle of the real table.
 *
 * It holds no cards — the server never sends it a hand — and it is the only
 * client allowed to run the match. Seats are drawn at the four edges so the
 * seat numbers double as a seating plan for the room.
 */

const POLL_MS = 2000;

/** Where each seat sits around the tablet, and how its plays fly in. */
const EDGE = ["table-seat--bottom", "table-seat--left", "table-seat--top", "table-seat--right"];

export function TableDisplay({
  roomId,
  initial,
  onRelease,
}: {
  roomId: string;
  initial: PublicRoom;
  onRelease: () => void;
}) {
  const [room, setRoom] = useState<PublicRoom>(initial);
  const [busy, setBusy] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [message, setMessage] = useState("");
  const seenLogEntries = useRef(initial.log.length);
  const dealtRound = useRef(initial.roundNumber);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/rooms/${roomId}/state`, { cache: "no-store" });
    if (!response.ok) return;
    setRoom((await response.json()) as PublicRoom);
  }, [roomId]);

  useEffect(() => {
    sound.loadMutePreference();
    const onGesture = () => sound.unlock();
    window.addEventListener("pointerdown", onGesture);
    return () => window.removeEventListener("pointerdown", onGesture);
  }, []);

  // The table polls faster than a phone: it is the screen everyone is watching.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!cancelled && document.visibilityState === "visible") {
        try {
          const response = await fetch(`/api/rooms/${roomId}/version`, { cache: "no-store" });
          if (response.ok) {
            const { version } = (await response.json()) as { version: number };
            if (!cancelled && version !== room.version) await refresh();
          }
        } catch {
          // Dropped polls are not worth reporting on a wall display.
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [roomId, room.version, refresh]);

  // The table is where everyone hears the game, so it plays every event.
  useEffect(() => {
    if (room.roundNumber !== dealtRound.current) {
      dealtRound.current = room.roundNumber;
      seenLogEntries.current = 0;
      sound.play("deal");
    }
    const fresh = room.log.slice(seenLogEntries.current);
    seenLogEntries.current = room.log.length;
    for (const entry of fresh) {
      if (entry.kind === "win") sound.play("win");
      else sound.play(entry.kind);
    }
  }, [room]);

  const control = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      try {
        const response = await fetch(`/api/rooms/${roomId}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (response.ok) {
          setRoom((await response.json()) as PublicRoom);
          setMessage("");
          return;
        }
        const { error } = (await response.json().catch(() => ({}))) as { error?: string };
        setMessage(error ?? "That did not work.");
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [roomId, refresh],
  );

  const table = room.table;
  // The plays before the current one, most recent first.
  const previous = room.history.slice(0, -1).slice(-3).reverse();

  return (
    <main className="table-display">
      <header className="table-display__bar">
        <div>
          <h1>Room {room.id}</h1>
          <span className="table-display__sub">
            Round {room.roundNumber} ·{" "}
            {room.finished
              ? `${room.seats[room.winner!].name} won`
              : `${room.seats[room.turn].name} to play`}
          </span>
        </div>
        <div className="table-display__controls">
          {message ? <span className="status__message">{message}</span> : null}
          <button
            type="button"
            className="btn"
            onClick={() => setScoring((v) => !v)}
            aria-pressed={scoring}
          >
            {scoring ? "Done scoring" : "Adjust scores"}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void control({ action: "nextRound" })}
            disabled={busy || !room.finished}
          >
            Next round
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              if (confirm("Restart the match? Scores go back to zero.")) {
                void control({ action: "resetMatch" });
              }
            }}
            disabled={busy}
          >
            Restart match
          </button>
          <button type="button" className="btn btn--ghost" onClick={onRelease}>
            Release table
          </button>
        </div>
      </header>

      <div className="table-display__felt">
        {room.seats.map((seat) => (
          <section
            key={seat.index}
            className={`table-seat ${EDGE[seat.index]} ${
              room.turn === seat.index && !room.finished ? "is-turn" : ""
            } ${room.winner === seat.index ? "is-winner" : ""}`}
          >
            <div className="table-seat__number">Seat {seat.index + 1}</div>
            <div className="table-seat__name">
              {/* A seat nobody named keeps the default "Seat N", which would
                  just repeat the number above it. */}
              {seat.name === `Seat ${seat.index + 1}` ? (
                <span className="table-seat__open">{seat.claimed ? "seated" : "open"}</span>
              ) : (
                seat.name
              )}
              {seat.automated ? <span className="seat__badge seat__badge--muted">AI</span> : null}
              {room.passed[seat.index] ? (
                <span className="seat__badge seat__badge--muted">passed</span>
              ) : null}
              {room.leader === seat.index && table ? (
                <span className="seat__badge">leads</span>
              ) : null}
            </div>
            <div className="table-seat__stats">
              <span className="table-seat__cards">
                {seat.cards} card{seat.cards === 1 ? "" : "s"}
              </span>
              <span
                className={`table-seat__score ${room.scores[seat.index] < 0 ? "is-negative" : ""}`}
              >
                {room.scores[seat.index] > 0 ? `+${room.scores[seat.index]}` : room.scores[seat.index]}
              </span>
            </div>
            {scoring ? (
              <div className="table-seat__adjust">
                {[-5, -1, 1, 5].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    className="btn btn--tiny"
                    disabled={busy}
                    onClick={() => void control({ action: "adjustScore", seat: seat.index, delta })}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ))}

        <div className="table-display__pile">
          {table ? (
            <>
              <div className="table-display__to-beat">
                {room.seats[table.player].name} played {comboName(table.combo)} — beat it
              </div>
              <div
                className="table-display__cards"
                key={table.combo.cards.map((c) => c.id).join("-")}
              >
                {table.combo.cards.map((card, i) => (
                  <CardView key={card.id} card={card} index={i} from={table.player} />
                ))}
              </div>
            </>
          ) : (
            <div className="pile__empty">
              Table is clear
              <span>{room.seats[room.leader].name} leads</span>
            </div>
          )}
        </div>
      </div>

      <footer className="table-history" aria-label="Recent plays">
        <span className="table-history__label">Last plays</span>
        {previous.length === 0 ? (
          <span className="table-history__empty">Nothing yet this trick</span>
        ) : (
          previous.map((play, i) => (
            <div className="table-history__entry" key={`${play.player}-${play.combo.cards[0].id}`}>
              <span className="table-history__who">
                {room.seats[play.player].name} · {comboName(play.combo)}
              </span>
              <div className="table-history__cards" style={{ opacity: 1 - i * 0.22 }}>
                {play.combo.cards.map((card) => (
                  <CardView key={card.id} card={card} />
                ))}
              </div>
            </div>
          ))
        )}
      </footer>

      {room.finished && room.lastDeltas ? (
        <Modal title={`${room.seats[room.winner!].name} won round ${room.roundNumber}`}>
          <table className="results">
            <thead>
              <tr>
                <th>Seat</th>
                <th>Cards left</th>
                <th>Round</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {room.seats.map((seat) => (
                <tr key={seat.index} className={seat.index === room.winner ? "is-winner" : ""}>
                  <td>
                    {seat.index + 1} · {seat.name}
                  </td>
                  <td>{seat.cards}</td>
                  <td className={room.lastDeltas![seat.index] < 0 ? "is-negative" : ""}>
                    {room.lastDeltas![seat.index] > 0
                      ? `+${room.lastDeltas![seat.index]}`
                      : room.lastDeltas![seat.index]}
                  </td>
                  <td>{room.scores[seat.index]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void control({ action: "nextRound" })}
            disabled={busy}
          >
            Deal the next round
          </button>
        </Modal>
      ) : null}
    </main>
  );
}
