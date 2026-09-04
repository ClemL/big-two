"use client";

import { useCallback, useEffect, useState } from "react";
import { OnlineTable } from "@/components/OnlineTable";
import type { PublicRoom } from "@/lib/room";

/**
 * Seat picking, then the table. No accounts: the room password gets you in,
 * and the server hands back a per-seat cookie that identifies you afterwards.
 */
export function RoomLobby({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [error, setError] = useState<string>("");
  const [notFound, setNotFound] = useState(false);
  const [seat, setSeat] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/rooms/${roomId}/state`, { cache: "no-store" });
    if (response.status === 404) {
      setNotFound(true);
      return;
    }
    if (!response.ok) return;
    setRoom((await response.json()) as PublicRoom);
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the seat list fresh while someone is deciding where to sit.
  useEffect(() => {
    if (!room || room.seat !== null) return;
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [room, load]);

  const join = useCallback(async () => {
    if (seat === null) {
      setError("Pick a seat first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/rooms/${roomId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seat, password, name }),
      });
      if (response.ok) {
        setRoom((await response.json()) as PublicRoom);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not take that seat.");
      await load();
    } finally {
      setBusy(false);
    }
  }, [roomId, seat, password, name, load]);

  const leave = useCallback(async () => {
    await fetch(`/api/rooms/${roomId}/join`, { method: "DELETE" });
    setSeat(null);
    await load();
  }, [roomId, load]);

  if (notFound) {
    return (
      <main className="app lobby">
        <h1>Room {roomId} not found</h1>
        <p className="lobby__hint">
          Rooms expire after a week of silence. <a href="/play">Start a new one.</a>
        </p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="app">
        <p className="loading">Looking up room {roomId}…</p>
      </main>
    );
  }

  if (room.seat !== null) {
    return <OnlineTable roomId={roomId} initial={room} onLeave={leave} />;
  }

  return (
    <main className="app lobby">
      <h1>Room {room.id}</h1>
      <p className="lobby__hint">
        Pick a seat and enter the table password. Empty seats are played by the AI, so a round works
        with any number of people.
      </p>

      <div className="lobby__seats">
        {room.seats.map((s) => {
          const taken = s.claimed && !s.automated;
          return (
            <button
              key={s.index}
              type="button"
              className={`lobby__seat ${seat === s.index ? "is-selected" : ""}`}
              onClick={() => setSeat(s.index)}
              disabled={taken}
            >
              <span className="lobby__seat-name">{s.name}</span>
              <span className="lobby__seat-state">
                {taken ? "taken" : s.claimed ? "away — can be taken" : "open · AI is playing it"}
              </span>
              <span className="lobby__seat-cards">{s.cards} cards</span>
            </button>
          );
        })}
      </div>

      <div className="lobby__form">
        <label className="field field--stacked">
          <span>Your name</span>
          <input
            value={name}
            maxLength={16}
            placeholder="Kris"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field field--stacked">
          <span>Table password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void join();
            }}
          />
        </label>
        <button type="button" className="btn btn--primary" onClick={() => void join()} disabled={busy}>
          {busy ? "Sitting down…" : "Take seat"}
        </button>
      </div>

      {error ? <p className="lobby__error">{error}</p> : null}

      <p className="lobby__hint">
        Share this link with the others: <code>{`/room/${room.id}`}</code>
      </p>
    </main>
  );
}
