import { encodeQr, type EccLevel } from "@/lib/qr";

/**
 * A QR code as SVG, drawn the same way the deck is: geometry comes from `lib`,
 * this only paints it. No canvas and no image, so it stays crisp on a tablet
 * held at arm's length and costs nothing to re-render.
 */
export function QrCode({
  text,
  level = "M",
  className,
  title,
}: {
  text: string;
  level?: EccLevel;
  className?: string;
  /** Accessible name. Omit for a code that a caption already describes. */
  title?: string;
}) {
  let matrix;
  try {
    matrix = encodeQr(text, level);
  } catch {
    // A URL too long to encode is a bug, but a wall display is the worst place
    // to throw: drop the code rather than take the whole table down with it.
    return null;
  }

  // Four modules of quiet zone, as the specification requires — without it
  // many scanners will not lock on.
  const quiet = 4;
  const span = matrix.size + quiet * 2;

  // One path for every dark module beats one rect each: a version 6 code is
  // over 700 modules, and 700 DOM nodes per seat is four times too many.
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) parts.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }
  }

  return (
    <svg
      className={className}
      viewBox={`0 0 ${span} ${span}`}
      role="img"
      aria-label={title}
      aria-hidden={title ? undefined : true}
      shapeRendering="crispEdges"
    >
      <rect width={span} height={span} fill="#fbfaf6" />
      <path d={parts.join("")} fill="#10231c" />
    </svg>
  );
}
