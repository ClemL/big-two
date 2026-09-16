"use client";

import { useEffect, useRef, useState } from "react";
import { suggestName } from "@/lib/names";

/**
 * Where a seat's QR code lands.
 *
 * It claims the seat and then hands over to the normal room page, which
 * already knows how to show a seated player their hand — including dropping to
 * the pocket layout when a table display is running, which is the whole point
 * of scanning in at a table.
 */
export function ScanJoin({ roomId, code }: { roomId: string; code: string }) {
  const [error, setError] = useState("");
  const claimed = useRef(false);

  useEffect(() => {
    // Effects run twice in development; claiming twice would burn a seat.
    if (claimed.current) return;
    claimed.current = true;

    void (async () => {
      try {
        const response = await fetch(`/api/rooms/${roomId}/invite`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, name: suggestName() }),
        });
        if (response.ok) {
          // Replace rather than push: the back button should not re-run a claim.
          window.location.replace(`/room/${roomId}`);
          return;
        }
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "That seat could not be taken.");
      } catch {
        setError("Could not reach the table — check the connection and try again.");
      }
    })();
  }, [roomId, code]);

  if (error) {
    return (
      <main className="app lobby">
        <h1>Room {roomId}</h1>
        <p className="lobby__error">{error}</p>
        <p className="lobby__hint">
          Scan the code on the table again, or <a href={`/room/${roomId}`}>pick a seat by hand</a>.
        </p>
      </main>
    );
  }

  return (
    <main className="app">
      <p className="loading">Taking your seat at room {roomId}…</p>
    </main>
  );
}
