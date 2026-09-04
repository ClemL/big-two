"use client";

/** Last resort: the root layout itself failed, so this brings its own document. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0b3d2e",
          color: "#f4f1e8",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22 }}>Big Two could not start</h1>
          <p style={{ color: "#a9bdb2", fontSize: 14 }}>Reloading usually clears it.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 12,
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid #e0b642",
              background: "#e0b642",
              color: "#24200f",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
