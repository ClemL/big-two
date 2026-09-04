import { ImageResponse } from "next/og";

export const alt = "Big Two — Hong Kong rules";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Rendered at build time, so a shared room link previews as a card table. */
export default function OpengraphImage() {
  const suits = [
    { glyph: "♠", color: "#17181c" },
    { glyph: "♥", color: "#c62f22" },
    { glyph: "♣", color: "#17181c" },
    { glyph: "♦", color: "#c62f22" },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 34,
          background: "linear-gradient(160deg, #14614a 0%, #0b3d2e 55%, #062219 100%)",
          color: "#f4f1e8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", gap: 18 }}>
          {suits.map((suit, i) => (
            <div
              key={suit.glyph}
              style={{
                width: 132,
                height: 184,
                background: "#fcfbf7",
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 86,
                color: suit.color,
                transform: `rotate(${(i - 1.5) * 5}deg)`,
                boxShadow: "0 12px 26px rgba(0,0,0,0.4)",
              }}
            >
              {suit.glyph}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -1 }}>Big Two</div>
          <div style={{ fontSize: 30, color: "#a9bdb2" }}>
            Hong Kong rules · one to four players · AI fills the empty seats
          </div>
        </div>
      </div>
    ),
    size,
  );
}
