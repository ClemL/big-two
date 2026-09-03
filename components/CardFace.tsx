"use client";

import type { Card } from "@/lib/cards";
import { RANKS, SUITS, isRed } from "@/lib/cards";

/**
 * Cards are drawn as SVG on a 100x140 grid: crisp at any size, no image
 * assets, and the pip layouts follow the standard French-deck arrangement
 * (bottom-half pips are rotated, as they are on a real card).
 */

const SUIT_PATH: Record<string, string> = {
  // Each shape is authored inside a 0..100 box and scaled where it is used.
  S: "M50 4C50 4 10 36 10 60c0 13 9 22 21 22 7 0 13-3 17-9-1 12-6 20-14 26h32c-8-6-13-14-14-26 4 6 10 9 17 9 12 0 21-9 21-22C90 36 50 4 50 4Z",
  H: "M50 94C22 72 6 52 6 33 6 17 18 6 32 6c9 0 15 4 18 11 3-7 9-11 18-11 14 0 26 11 26 27 0 19-16 39-44 61Z",
  D: "M50 2 92 50 50 98 8 50Z",
  C: "M50 4a20 20 0 1 0 .01 0ZM26 38a20 20 0 1 0 .01 0ZM74 38a20 20 0 1 0 .01 0ZM44 60c0 18-4 28-12 36h36c-8-8-12-18-12-36Z",
};

/** [x, y, upsideDown] pip positions for each rank. */
const PIP_LAYOUT: Record<string, [number, number, boolean?][]> = {
  "2": [[50, 36], [50, 104, true]],
  "3": [[50, 36], [50, 70], [50, 104, true]],
  "4": [[32, 36], [68, 36], [32, 104, true], [68, 104, true]],
  "5": [[32, 36], [68, 36], [50, 70], [32, 104, true], [68, 104, true]],
  "6": [[32, 36], [68, 36], [32, 70], [68, 70], [32, 104, true], [68, 104, true]],
  "7": [[32, 36], [68, 36], [50, 53], [32, 70], [68, 70], [32, 104, true], [68, 104, true]],
  "8": [
    [32, 36], [68, 36], [50, 53], [32, 70], [68, 70],
    [50, 87, true], [32, 104, true], [68, 104, true],
  ],
  "9": [
    [32, 32], [68, 32], [32, 55], [68, 55], [50, 70],
    [32, 85, true], [68, 85, true], [32, 108, true], [68, 108, true],
  ],
  "10": [
    [32, 32], [68, 32], [50, 43], [32, 55], [68, 55],
    [50, 97, true], [32, 85, true], [68, 85, true], [32, 108, true], [68, 108, true],
  ],
};

const COURT = new Set(["J", "Q", "K"]);

function Pip({ suit, x, y, scale, flipped }: { suit: string; x: number; y: number; scale: number; flipped?: boolean }) {
  const transforms = [
    `translate(${x} ${y})`,
    flipped ? "rotate(180)" : "",
    `scale(${scale})`,
    "translate(-50 -50)",
  ].filter(Boolean);
  return <path d={SUIT_PATH[suit]} transform={transforms.join(" ")} />;
}

/** Half of a court card's design; drawn once, then again rotated 180°. */
function CourtHalf({ rank, suit }: { rank: string; suit: string }) {
  return (
    <g>
      {rank === "K" ? (
        <path d="M39 46 36 32l7 5 7-9 7 9 7-5-3 14Z" className="court-emblem" />
      ) : rank === "Q" ? (
        <>
          <path d="M40 46 37 34l6 4 7-8 7 8 6-4-3 12Z" className="court-emblem" />
          <circle cx="50" cy="27" r="2.6" className="court-emblem" />
        </>
      ) : (
        <>
          <path d="M40 46v-7c0-5.5 4.5-9 10-9s10 3.5 10 9v7Z" className="court-emblem" />
          <circle cx="50" cy="26" r="2.6" className="court-emblem" />
        </>
      )}
      <line x1="38" y1="49" x2="62" y2="49" className="court-rule" />
      <Pip suit={suit} x={50} y={60} scale={0.16} />
      <circle cx="30" cy="29" r="1.4" className="court-fleck" />
      <circle cx="70" cy="29" r="1.4" className="court-fleck" />
    </g>
  );
}

export function CardFaceSvg({ card }: { card: Card }) {
  const rank = RANKS[card.rank];
  const suit = SUITS[card.suit];
  const tone = isRed(card) ? "#c62f22" : "#17181c";
  const layout = PIP_LAYOUT[rank];

  return (
    <svg viewBox="0 0 100 140" className="card__svg" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="98" height="138" rx="9" fill="#fcfbf7" stroke="rgba(0,0,0,0.28)" strokeWidth="1.2" />
      <rect x="4.5" y="4.5" width="91" height="131" rx="6.5" fill="none" stroke="rgba(0,0,0,0.07)" />

      <g fill={tone} style={{ color: tone }}>
        {/* Corner indices, mirrored so the card reads either way up. */}
        {[false, true].map((flipped) => (
          <g key={String(flipped)} transform={flipped ? "rotate(180 50 70)" : undefined}>
            {/* "10" is the only two-character index and needs to be narrower. */}
            <text
              x={rank === "10" ? 13 : 11}
              y="20"
              className="card__index"
              textAnchor="middle"
              style={{ fontSize: rank === "10" ? 17 : 21 }}
            >
              {rank}
            </text>
            <Pip suit={suit} x={rank === "10" ? 13 : 11} y={30} scale={0.095} />
          </g>
        ))}

        {rank === "A" ? (
          <Pip suit={suit} x={50} y={70} scale={0.46} />
        ) : COURT.has(rank) ? (
          <>
            <rect
              x="23"
              y="23"
              width="54"
              height="94"
              rx="5"
              fill={isRed(card) ? "rgba(198,47,34,0.07)" : "rgba(23,24,28,0.06)"}
              stroke={tone}
              strokeWidth="1.1"
            />
            <line x1="23" y1="70" x2="77" y2="70" stroke={tone} strokeWidth="0.8" opacity="0.5" />
            <CourtHalf rank={rank} suit={suit} />
            <g transform="rotate(180 50 70)">
              <CourtHalf rank={rank} suit={suit} />
            </g>
          </>
        ) : (
          layout?.map(([x, y, flipped], i) => (
            <Pip key={i} suit={suit} x={x} y={y} scale={0.2} flipped={flipped} />
          ))
        )}
      </g>
    </svg>
  );
}

export function CardBackSvg() {
  return (
    <svg viewBox="0 0 100 140" className="card__svg" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="cardback-lattice" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="#1b4a86" />
          <path d="M0 0h10M0 5h10" stroke="#2a63a8" strokeWidth="1.6" />
        </pattern>
      </defs>
      <rect x="1" y="1" width="98" height="138" rx="9" fill="#0f3a6b" />
      <rect x="1" y="1" width="98" height="138" rx="9" fill="url(#cardback-lattice)" stroke="rgba(0,0,0,0.45)" strokeWidth="1.2" />
      <rect x="7" y="7" width="86" height="126" rx="6" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />
      <g fill="rgba(255,255,255,0.9)">
        <path d={SUIT_PATH.S} transform="translate(50 70) scale(0.26) translate(-50 -50)" />
      </g>
      <g fill="rgba(255,255,255,0.45)">
        <path d={SUIT_PATH.D} transform="translate(50 30) scale(0.13) translate(-50 -50)" />
        <path d={SUIT_PATH.C} transform="translate(50 110) scale(0.13) translate(-50 -50)" />
      </g>
    </svg>
  );
}
