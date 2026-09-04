"use client";

import { useCallback, useEffect, useState } from "react";
import { TableDisplay } from "@/components/TableDisplay";
import type { PublicRoom } from "@/lib/room";

/** Password gate in front of the shared table display. */
export function TableSeatGate({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  // A tablet left on the table should come straight back after a reload.
  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/rooms/${roomId}/state`, { cache: "no-store" });
      if (response.ok) {
        const view = (await response.json()) as PublicRoom;
        if (view.isTableSeat) setRoom(view);
      }
      setChecked(true);
    })();
  }, [roomId]);

  const claim = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/rooms/${roomId}/table`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        setRoom((await response.json()) as PublicRoom);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not take the table.");
    } finally {
      setBusy(false);
    }
  }, [roomId, password]);

  const release = useCallback(async () => {
    await fetch(`/api/rooms/${roomId}/table`, { method: "DELETE" });
    setRoom(null);
  }, [roomId]);

  if (room) return <TableDisplay roomId={roomId} initial={room} onRelease={release} />;

  if (!checked) {
    return (
      <main className="app">
        <p className="loading">Looking up room {roomId}…</p>
      </main>
    );
  }

  return (
    <main className="app lobby">
      <h1>Table display · room {roomId}</h1>
      <p className="lobby__hint">
        Put this device in the middle of the table. It shows the hand to beat, the last few plays,
        every score and card count, and which seat number sits where. It never sees anybody&apos;s
        cards. Players use their phones, which drop to just their own hand and buttons while this is
        running.
      </p>
      <div className="lobby__form">
        <label className="field field--stacked">
          <span>Table password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void claim();
            }}
          />
        </label>
        <button type="button" className="btn btn--primary" onClick={() => void claim()} disabled={busy}>
          {busy ? "Taking the table…" : "Use this device as the table"}
        </button>
      </div>
      {error ? <p className="lobby__error">{error}</p> : null}
      <p className="lobby__hint">
        <a href={`/room/${roomId}`}>Take a seat instead</a>
      </p>
    </main>
  );
}
