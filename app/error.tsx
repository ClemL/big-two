"use client";

import { useEffect } from "react";

/**
 * A thrown render is worse here than in most apps: the tablet is propped up in
 * the middle of a table mid-game. Offer the two ways out rather than a blank
 * screen.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[big-two]", error);
  }, [error]);

  return (
    <main className="app lobby">
      <h1>Something went wrong</h1>
      <p className="lobby__hint">
        The game state on the server is untouched — reloading picks it back up where it was.
        {error.digest ? ` Reference ${error.digest}.` : ""}
      </p>
      <div className="lobby__form">
        <button type="button" className="btn btn--primary" onClick={reset}>
          Try again
        </button>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Reload the page
        </button>
        <a className="btn btn--ghost" href="/">
          Back to single player
        </a>
      </div>
    </main>
  );
}
