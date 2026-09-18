"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CardBack, CardView } from "@/components/CardView";
import { QrCode } from "@/components/QrCode";
import { Modal } from "@/components/Modal";
import { comboName } from "@/lib/combos";
import { previousPlays } from "@/lib/engine";
import { useTableTurnSignal, useWakeLock } from "@/components/hooks";
import * as sound from "@/lib/sound";
import type { PublicRoom } from "@/lib/room";
import { AI_STYLE_LABEL, type AiStyle } from "@/lib/ai";
import {
  DENSITY_LABEL,
  FONT_SCALE_RANGE,
  LAYOUT_LABEL,
  QR_SCALE_RANGE,
  TABLE_SETTINGS_KEY,
  THEME_LABEL,
  readTableSettings,
  type TableDensity,
  type TableLayout,
  type TableSettings,
  type TableTheme,
} from "@/lib/tableSettings";

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

/** Pacing presets, in milliseconds between AI plays. */
const AI_PACES = [
  { ms: 0, label: "Instant" },
  { ms: 1000, label: "1 second" },
  { ms: 2000, label: "2 seconds" },
  { ms: 3000, label: "3 seconds" },
  { ms: 5000, label: "5 seconds" },
];

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
  const [showCodes, setShowCodes] = useState(true);
  // window.location is not there for the server render, so the invite links are
  // built after mount.
  const [origin, setOrigin] = useState("");

  const [showPassword, setShowPassword] = useState(true);
  const [settings, setSettings] = useState<TableSettings>(() => readTableSettings(null));
  const [showSettings, setShowSettings] = useState(false);
  const [password, setPassword] = useState("");
  const [now, setNow] = useState(0);

  // Read after mount: the server render has no localStorage, and settings that
  // differed between the two passes would flash the default theme on every load.
  useEffect(() => {
    try {
      setSettings(readTableSettings(localStorage.getItem(TABLE_SETTINGS_KEY)));
    } catch {
      // Storage can be refused; the defaults are a perfectly good table.
    }
  }, []);

  const update = useCallback((patch: Partial<TableSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(TABLE_SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // A tablet that cannot persist still applies the change for this run.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    // Stashed by the express setup on /play. It is never sent by the server —
    // the store only holds a PBKDF2 hash — so this is the only way the table
    // can show the password it was created with.
    try {
      setPassword(sessionStorage.getItem(`bigtwo_pw_${roomId}`) ?? "");
    } catch {
      // Private browsing can refuse storage; the label is a convenience.
    }
  }, [roomId]);

  // One interval for the clock, ticking only while a match is under way.
  useEffect(() => {
    if (room.phase !== "playing" || room.startedAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [room.phase, room.startedAt]);
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

  // The table is what the room listens to, so it calls the change of turn.
  useTableTurnSignal(room.turn, room.finished);
  useWakeLock(true);

  const waiting = room.phase === "lobby";
  const elapsed =
    room.startedAt === null || now === 0 ? null : Math.max(0, Math.floor((now - room.startedAt) / 1000));
  const clock =
    elapsed === null
      ? null
      : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const seated = room.seats.filter((seat) => seat.claimed).length;

  const headline = waiting ? (
    <strong className="table-display__turn">
      Waiting to start · {seated} of 4 seats taken — the rest play as AI
    </strong>
  ) : (
    <>
      Round {room.roundNumber} ·{" "}
      {room.finished ? (
        `${room.seats[room.winner!].name} won`
      ) : (
        <strong className="table-display__turn">
          ▸ Seat {room.turn + 1} · {room.seats[room.turn].name} to play
        </strong>
      )}
    </>
  );

  const table = room.table;
  // The plays before the current one, most recent first. History outlives the
  // trick, so a swept table can still be read.
  const corners = settings.layout === "corners";
  // Corners hands the whole middle band to the cards, so it can carry more of
  // the trick than the edge layout, which is squeezed from both sides.
  const previous = previousPlays(room.history, table, corners ? 6 : 3).slice().reverse();

  return (
    <main
      className={`table-display table-display--${settings.density} table-display--${settings.layout}`}
      data-table-theme={settings.theme}
      style={
        {
          "--table-font": settings.fontScale,
          "--qr-scale": settings.qrScale,
        } as React.CSSProperties
      }
    >
      <header className="table-display__bar">
        <div>
          <h1>Room {room.id}</h1>
          <span className="table-display__sub">{headline}</span>
        </div>
        <div className="table-display__controls">
          {message ? <span className="status__message">{message}</span> : null}
          {clock ? (
            <span className="table-display__clock" aria-label="Time since the match started">
              {clock}
            </span>
          ) : null}
          <button
            type="button"
            className="btn"
            onClick={() => setScoring((v) => !v)}
            aria-pressed={scoring}
          >
            {scoring ? "Done scoring" : "Adjust scores"}
          </button>
          {room.phase === "lobby" ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void control({ action: "startMatch" })}
              disabled={busy}
            >
              Start game
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void control({ action: "nextRound" })}
              disabled={busy || !room.finished}
            >
              Next round
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => setShowCodes((v) => !v)}
            aria-pressed={showCodes}
          >
            {showCodes ? "Hide codes" : "Show codes"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setShowSettings(true)}
            aria-haspopup="dialog"
          >
            Display
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

      {password ? (
        <div className="table-pass">
          <span className="table-pass__label">Table password</span>
          {showPassword ? <code className="table-pass__value">{password}</code> : null}
          <button
            type="button"
            className="btn btn--tiny"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={!showPassword}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
          <span className="table-pass__hint">
            for anyone joining from {origin.replace(/^https?:\/\//, "")} without scanning
          </span>
        </div>
      ) : null}

      <div className="table-display__felt">
        {room.seats.map((seat) => (
          <section
            key={seat.index}
            className={`table-seat ${EDGE[seat.index]} ${
              room.turn === seat.index && !room.finished && !waiting ? "is-turn" : ""
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
              {seat.automated && !waiting ? (
                <span className="seat__badge seat__badge--muted">AI</span>
              ) : null}
              {room.passed[seat.index] ? (
                <span className="seat__badge seat__badge--muted">passed</span>
              ) : null}
              {room.leader === seat.index && table ? (
                <span className="seat__badge">leads</span>
              ) : null}
            </div>
            {/* A fan of backs reads as "how far behind is that seat" at a
                glance, which a number never does across a table. */}
            {waiting ? null : (
              <div className="table-seat__fan">
                <CardBack count={seat.cards} />
              </div>
            )}
            <div className="table-seat__stats">
              <span className="table-seat__cards">
                {waiting ? (seat.claimed ? "ready" : "waiting") : `${seat.cards} card${seat.cards === 1 ? "" : "s"}`}
              </span>
              <span
                className={`table-seat__score ${room.scores[seat.index] < 0 ? "is-negative" : ""}`}
              >
                <span className="table-seat__score-label">score</span>
                {room.scores[seat.index] > 0 ? `+${room.scores[seat.index]}` : room.scores[seat.index]}
              </span>
            </div>
            {/* A filled seat has no use for its code, and an empty square of
                white is the clearest "this one is still free" the table has. */}
            {showCodes && !seat.claimed && room.inviteCodes?.[seat.index] && origin ? (
              <div className="table-seat__invite">
                <QrCode
                  className="table-seat__qr"
                  text={`${origin}/room/${room.id}/j/${room.inviteCodes[seat.index]}`}
                  title={`Scan to take seat ${seat.index + 1}`}
                />
                <span className="table-seat__invite-hint">scan to sit here</span>
              </div>
            ) : null}
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

        <div className="table-display__middle">
          <div className="table-display__past" aria-label="Recent plays">
            {waiting || previous.length === 0
              ? null
              : previous.map((play, i) => (
                  <div
                    className="table-history__entry"
                    key={`${play.trick}-${play.player}-${play.combo.cards[0].id}`}
                    style={{ opacity: 1 - i * 0.22 }}
                  >
                    <span className="table-history__who">{room.seats[play.player].name}</span>
                    <div className="table-history__cards">
                      {play.combo.cards.map((card) => (
                        <CardView key={card.id} card={card} />
                      ))}
                    </div>
                  </div>
                ))}
          </div>

        <div className="table-display__pile">
          {waiting ? (
            <div className="pile__empty">
              Scan a seat to join
              <span>Press Start game when everyone is in — AI takes the rest</span>
            </div>
          ) : table ? (
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
      </div>

      {showSettings ? (
        <Modal title="Display and opponents" onClose={() => setShowSettings(false)}>
          <div className="table-options">
            <label className="field field--stacked">
              <span>Theme</span>
              <select
                value={settings.theme}
                onChange={(e) => update({ theme: e.target.value as TableTheme })}
              >
                {(Object.keys(THEME_LABEL) as TableTheme[]).map((key) => (
                  <option key={key} value={key}>
                    {THEME_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field--stacked">
              <span>Seats</span>
              <select
                value={settings.layout}
                onChange={(e) => update({ layout: e.target.value as TableLayout })}
              >
                {(Object.keys(LAYOUT_LABEL) as TableLayout[]).map((key) => (
                  <option key={key} value={key}>
                    {LAYOUT_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field--stacked">
              <span>Spacing</span>
              <select
                value={settings.density}
                onChange={(e) => update({ density: e.target.value as TableDensity })}
              >
                {(Object.keys(DENSITY_LABEL) as TableDensity[]).map((key) => (
                  <option key={key} value={key}>
                    {DENSITY_LABEL[key]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field--stacked">
              <span>Text size · {Math.round(settings.fontScale * 100)}%</span>
              <input
                type="range"
                min={FONT_SCALE_RANGE.min}
                max={FONT_SCALE_RANGE.max}
                step={FONT_SCALE_RANGE.step}
                value={settings.fontScale}
                onChange={(e) => update({ fontScale: Number(e.target.value) })}
              />
            </label>

            <label className="field field--stacked">
              <span>QR code size · {Math.round(settings.qrScale * 100)}%</span>
              <input
                type="range"
                min={QR_SCALE_RANGE.min}
                max={QR_SCALE_RANGE.max}
                step={QR_SCALE_RANGE.step}
                value={settings.qrScale}
                onChange={(e) => update({ qrScale: Number(e.target.value) })}
              />
            </label>

            <label className="field field--stacked">
              <span>Opponent skill</span>
              <select
                value={room.aiStyle}
                disabled={busy}
                onChange={(e) => void control({ action: "setAiStyle", aiStyle: e.target.value })}
              >
                {(Object.keys(AI_STYLE_LABEL) as AiStyle[]).map((key) => (
                  <option key={key} value={key}>
                    {AI_STYLE_LABEL[key]}
                  </option>
                ))}
              </select>
              <span className="field__hint">
                Shared by the table, unlike the rest here. It applies from the next AI turn, so the
                round in progress carries on with the hands already dealt.
              </span>
            </label>

            <label className="field field--stacked">
              <span>AI pace</span>
              <select
                value={String(room.aiDelayMs)}
                disabled={busy}
                onChange={(e) =>
                  void control({ action: "setAiDelay", aiDelayMs: Number(e.target.value) })
                }
              >
                {AI_PACES.map((pace) => (
                  <option key={pace.ms} value={pace.ms}>
                    {pace.label}
                  </option>
                ))}
              </select>
              <span className="field__hint">
                How long the opponents wait between plays. Instant resolves a whole row of them
                between two polls, so nobody sees the cards land; a pace gives each play its own
                moment on the table.
              </span>
            </label>
          </div>
        </Modal>
      ) : null}

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
