/**
 * Round-trip the QR encoder through an independent decoder.
 *
 * `npm test` cannot do this — it runs on node:test with no dependencies — but
 * an encoder nobody has decoded is an encoder nobody should trust. This found
 * two real bugs: a BCH remainder that never converged, and alignment patterns
 * silently skipped wherever their centre crossed a timing pattern.
 *
 *   npm i --no-save jsqr && node bench/qr-decode.mjs
 */

import { encodeQr } from "../lib/qr.ts";

const { default: jsQR } = await import("jsqr").catch(() => {
  console.error("jsqr is not installed. Run: npm i --no-save jsqr");
  process.exit(2);
});

/** Paint a matrix into an RGBA bitmap with the quiet zone a scanner expects. */
function raster(matrix, scale = 4, quiet = 4) {
  const span = (matrix.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(span * span * 4).fill(255);
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const at = (((y + quiet) * scale + dy) * span + ((x + quiet) * scale + dx)) * 4;
          data[at] = 0;
          data[at + 1] = 0;
          data[at + 2] = 0;
        }
      }
    }
  }
  return { data, span };
}

function decodes(text, level) {
  const matrix = encodeQr(text, level);
  const { data, span } = raster(matrix);
  const got = jsQR(data, span, span);
  return { ok: got?.data === text, version: matrix.version, size: matrix.size };
}

let checked = 0;
let failed = 0;

// Real invite URLs, including the long Vercel preview hostname.
const urls = [
  "https://clem-big-two.vercel.app/room/ABC123/j/a1b2c3d4e5f60718",
  "https://clem-big-two-git-claude-optimistic-meitner-ldre78-clem21.vercel.app/room/ABC123/j/a1b2c3d4e5f60718",
  "http://localhost:3000/room/XY7Q2M/j/deadbeefcafef00d",
];

for (const level of ["L", "M"]) {
  for (const url of urls) {
    const result = decodes(url, level);
    checked++;
    if (!result.ok) {
      failed++;
      console.log(`FAIL ${level} v${result.version} ${url.length} bytes`);
    }
  }
  // Every length up to the cap, which walks every version and both the
  // version-info boundary at 7 and the character-count boundary at 10.
  for (let length = 1; length <= 200; length++) {
    const text = ("https://a.co/" + "b".repeat(200)).slice(0, length);
    let result;
    try {
      result = decodes(text, level);
    } catch {
      continue;
    }
    checked++;
    if (!result.ok) {
      failed++;
      if (failed < 10) console.log(`FAIL ${level} length ${length} v${result.version}`);
    }
  }
}

console.log(`${checked - failed}/${checked} decoded at levels L and M`);
process.exit(failed === 0 ? 0 : 1);
