"use client";

import { useCallback, useEffect, useState } from "react";
import { AI_STYLE_LABEL, type AiStyle } from "@/lib/ai";
import { suggestPassword } from "@/lib/names";

/** Start a table, or hop into one someone else started. */
export function CreateRoom() {
  const [password, setPassword] = useState("");
  const [aiStyle, setAiStyle] = useState<AiStyle>("weakest");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Suggested after mount, not during render: /play is prerendered, so a value
  // chosen at render time would differ between the server and client passes.
  useEffect(() => {
    setPassword((current) => (current === "" ? suggestPassword() : current));
  }, []);

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

  /**
   * One button from nothing to a table on a tablet: make the room, claim the
   * table seat with the password it was created with, and go. The password is
   * stashed for the display to show, because the server only keeps its hash.
   */
  const expressTable = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const word = password.length >= 3 ? password : suggestPassword();
      const created = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: word, aiStyle }),
      });
      const body = (await created.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!created.ok || !body.id) {
        setError(body.error ?? "Could not start a table.");
        return;
      }
      const claimed = await fetch(`/api/rooms/${body.id}/table`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: word }),
      });
      if (!claimed.ok) {
        // The room exists, so send them to it rather than losing the work.
        setError("The table was made but this device could not claim it.");
        window.location.href = `/room/${body.id}`;
        return;
      }
      try {
        sessionStorage.setItem(`bigtwo_pw_${body.id}`, word);
      } catch {
        // Without storage the table simply shows no password label.
      }
      window.location.href = `/room/${body.id}/table`;
    } finally {
      setBusy(false);
    }
  }, [password, aiStyle]);

  return (
    <main className="app lobby">
      <h1>Play with friends</h1>

      <section className="lobby__express">
        <div>
          <h2>Playing round one table?</h2>
          <p className="lobby__hint">
            Sets up a table on this device and shows a QR code for every seat. Everyone scans one and
            plays from their phone; the AI takes whatever is left.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--big"
          onClick={() => void expressTable()}
          disabled={busy}
        >
          {busy ? "Setting up…" : "Set up this device as the table"}
        </button>
      </section>

      <p className="lobby__hint">
        No accounts. Start a table, pick a password, and send the room code round. Whoever turns up
        claims a seat; the AI plays the ones nobody takes.
      </p>

      <div className="lobby__panels">
        <section className="lobby__panel">
          <h2>Start a table</h2>
          <label className="field field--stacked">
            <span>Table password</span>
            <div className="field__row">
              <input
                type="text"
                value={password}
                placeholder="at least 3 characters"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setPassword((current) => suggestPassword(current))}
                title="Suggest another word"
              >
                Shuffle
              </button>
            </div>
            <span className="field__hint">
              Shown in the clear so you can read it out. Anyone with it can take a seat.
            </span>
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
