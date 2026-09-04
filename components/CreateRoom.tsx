"use client";

import { useCallback, useState } from "react";
import { AI_STYLE_LABEL, type AiStyle } from "@/lib/ai";

/** Start a table, or hop into one someone else started. */
export function CreateRoom() {
  const [password, setPassword] = useState("");
  const [aiStyle, setAiStyle] = useState<AiStyle>("weakest");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const create = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, aiStyle }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "Could not start a table.");
        return;
      }
      window.location.href = `/room/${body.id}`;
    } finally {
      setBusy(false);
    }
  }, [password, aiStyle]);

  return (
    <main className="app lobby">
      <h1>Play with friends</h1>
      <p className="lobby__hint">
        No accounts. Start a table, pick a password, and send the room code round. Whoever turns up
        claims a seat; the AI plays the ones nobody takes.
      </p>

      <div className="lobby__panels">
        <section className="lobby__panel">
          <h2>Start a table</h2>
          <label className="field field--stacked">
            <span>Table password</span>
            <input
              type="password"
              value={password}
              placeholder="at least 3 characters"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="field field--stacked">
            <span>Empty seats play as</span>
            <select value={aiStyle} onChange={(e) => setAiStyle(e.target.value as AiStyle)}>
              {(Object.keys(AI_STYLE_LABEL) as AiStyle[]).map((style) => (
                <option key={style} value={style}>
                  {AI_STYLE_LABEL[style]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void create()}
            disabled={busy || password.length < 3}
          >
            {busy ? "Dealing…" : "Start table"}
          </button>
        </section>

        <section className="lobby__panel">
          <h2>Join a table</h2>
          <label className="field field--stacked">
            <span>Room code</span>
            <input
              value={code}
              maxLength={8}
              placeholder="ABC123"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && code) window.location.href = `/room/${code}`;
              }}
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (code) window.location.href = `/room/${code}`;
            }}
            disabled={!code}
          >
            Go to room
          </button>
        </section>
      </div>

      {error ? <p className="lobby__error">{error}</p> : null}
      <p className="lobby__hint">
        <a href="/">Back to the single-player game</a>
      </p>
    </main>
  );
}
