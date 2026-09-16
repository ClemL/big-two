/**
 * A QR encoder, because a seat invite has to survive being pointed at across a
 * table and this project draws its own graphics rather than shipping assets.
 *
 * Deliberately narrow: byte mode only, error correction L or M, versions 1
 * through 10 (up to 57x57 modules, 271 bytes at level L). That covers a room
 * URL with room to spare and keeps the tables below small enough to read.
 *
 * The output is a square matrix of booleans — true is a dark module. Turning
 * that into SVG is `components/QrCode.tsx`'s job, the same split as the deck:
 * geometry here, painting there.
 *
 * Reference: ISO/IEC 18004. The tables below are the standard's, transcribed;
 * a test round-trips the output through an independent decoder so a typo in
 * them fails loudly rather than producing a code that only some phones read.
 */

export type EccLevel = "L" | "M";

/** Data codewords per block, per version, as [ecPerBlock, g1, d1, g2, d2]. */
const BLOCKS: Record<EccLevel, readonly (readonly [number, number, number, number, number])[]> = {
  L: [
    [7, 1, 19, 0, 0],
    [10, 1, 34, 0, 0],
    [15, 1, 55, 0, 0],
    [20, 1, 80, 0, 0],
    [26, 1, 108, 0, 0],
    [18, 2, 68, 0, 0],
    [20, 2, 78, 0, 0],
    [24, 2, 97, 0, 0],
    [30, 2, 116, 0, 0],
    [18, 2, 68, 2, 69],
  ],
  M: [
    [10, 1, 16, 0, 0],
    [16, 1, 28, 0, 0],
    [26, 1, 44, 0, 0],
    [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0],
    [18, 4, 31, 0, 0],
    [22, 2, 38, 2, 39],
    [22, 3, 36, 2, 37],
    [26, 4, 43, 1, 44],
  ],
};

/** Centre coordinates of the alignment patterns, by version. */
const ALIGNMENT: readonly (readonly number[])[] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const ECC_BITS: Record<EccLevel, number> = { L: 0b01, M: 0b00 };

/* ---------------------------------------------------------------- GF(256) */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    // The QR field is GF(2^8) with primitive polynomial 0x11d.
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function mul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** The generator polynomial for `degree` error correction codewords. */
function generator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function eccFor(data: number[], count: number): number[] {
  const gen = generator(count);
  const remainder = new Array<number>(count).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let i = 0; i < count; i++) remainder[i] ^= mul(gen[i + 1], factor);
  }
  return remainder;
}

/* ------------------------------------------------------------------- BCH */

function bitLength(value: number): number {
  let length = 0;
  while (value > 0) {
    value >>= 1;
    length++;
  }
  return length;
}

function bch(value: number, generatorPoly: number, bits: number): number {
  let result = value << bits;
  const degree = bitLength(generatorPoly);
  // Long division in GF(2): cancel the top bit until what is left is the
  // remainder. Aligning on bit length rather than on a magnitude comparison
  // matters — the generator's own top bit has to land on the result's.
  while (bitLength(result) >= degree) {
    result ^= generatorPoly << (bitLength(result) - degree);
  }
  return result;
}

function formatBits(level: EccLevel, mask: number): number {
  const value = (ECC_BITS[level] << 3) | mask;
  return ((value << 10) | bch(value, 0b10100110111, 10)) ^ 0b101010000010010;
}

function versionBits(version: number): number {
  return (version << 12) | bch(version, 0b1111100100101, 12);
}

/* --------------------------------------------------------------- encoding */

function capacity(version: number, level: EccLevel): number {
  const [ec, g1, d1, g2, d2] = BLOCKS[level][version - 1];
  void ec;
  return g1 * d1 + g2 * d2;
}

/** The smallest version that fits `length` bytes, or 0 when none does. */
function pickVersion(length: number, level: EccLevel): number {
  for (let version = 1; version <= 10; version++) {
    // Mode indicator and character count: 4 + 8 bits up to version 9, 4 + 16
    // from version 10, so the header costs one more byte at the boundary.
    const header = version < 10 ? 2 : 3;
    if (length + header <= capacity(version, level)) return version;
  }
  return 0;
}

function toCodewords(text: string, version: number, level: EccLevel): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const bits: number[] = [];
  const push = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);

  const total = capacity(version, level) * 8;
  // Terminator: up to four zero bits, then zero-fill to a byte boundary.
  for (let i = 0; i < 4 && bits.length < total; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  // Pad bytes alternate 0xEC / 0x11 by specification.
  const pad = [0xec, 0x11];
  while (codewords.length < capacity(version, level)) {
    codewords.push(pad[(codewords.length - bits.length / 8) % 2]);
  }
  return codewords;
}

/** Split into blocks, add error correction, then interleave as the spec says. */
function interleave(codewords: number[], version: number, level: EccLevel): number[] {
  const [ecCount, g1, d1, g2, d2] = BLOCKS[level][version - 1];
  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];

  let offset = 0;
  for (let i = 0; i < g1; i++) {
    const block = codewords.slice(offset, offset + d1);
    offset += d1;
    blocks.push(block);
    ecBlocks.push(eccFor(block, ecCount));
  }
  for (let i = 0; i < g2; i++) {
    const block = codewords.slice(offset, offset + d2);
    offset += d2;
    blocks.push(block);
    ecBlocks.push(eccFor(block, ecCount));
  }

  const out: number[] = [];
  const longest = Math.max(d1, d2);
  for (let i = 0; i < longest; i++) {
    for (const block of blocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecCount; i++) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return out;
}

/* --------------------------------------------------------------- placement */

type Grid = (boolean | null)[][];

function blankGrid(size: number): Grid {
  return Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
}

function placeFinder(grid: Grid, row: number, col: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const y = row + r;
      const x = col + c;
      if (y < 0 || y >= grid.length || x < 0 || x >= grid.length) continue;
      const onRing = r === 0 || r === 6 || c === 0 || c === 6;
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      grid[y][x] = onRing || inCore;
    }
  }
}

function reserveFormat(grid: Grid): void {
  const size = grid.length;
  for (let i = 0; i < 9; i++) {
    if (grid[8][i] === null) grid[8][i] = false;
    if (grid[i][8] === null) grid[i][8] = false;
  }
  for (let i = 0; i < 8; i++) {
    if (grid[8][size - 1 - i] === null) grid[8][size - 1 - i] = false;
    if (grid[size - 1 - i][8] === null) grid[size - 1 - i][8] = false;
  }
}

function buildSkeleton(version: number): { grid: Grid; reserved: boolean[][] } {
  const size = version * 4 + 17;
  const grid = blankGrid(size);

  placeFinder(grid, 0, 0);
  placeFinder(grid, 0, size - 7);
  placeFinder(grid, size - 7, 0);

  // Timing patterns run between the finders.
  for (let i = 8; i < size - 8; i++) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }

  const centres = ALIGNMENT[version - 1];
  const last = centres[centres.length - 1];
  for (const row of centres) {
    for (const col of centres) {
      // Only the three finder corners are skipped. Testing "is this cell
      // already set" instead looks equivalent and is not: from version 7 the
      // centres at (6, n) and (n, 6) sit on the timing patterns, and those
      // alignment patterns do belong there — they overwrite the timing run.
      const onFinder =
        (row === 6 && col === 6) || (row === 6 && col === last) || (row === last && col === 6);
      if (onFinder) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          grid[row + r][col + c] = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
        }
      }
    }
  }

  // The dark module, always set, just above the lower-left format strip.
  grid[size - 8][8] = true;

  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      grid[b][a] = bit;
      grid[a][b] = bit;
    }
  }

  reserveFormat(grid);

  // Anything set by now is structure; the data stream must skip it.
  const reserved = grid.map((row) => row.map((cell) => cell !== null));
  return { grid, reserved };
}

function placeData(grid: Grid, reserved: boolean[][], codewords: number[]): void {
  const size = grid.length;
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right > 0; right -= 2) {
    // Column 6 is the vertical timing pattern and is not part of the zigzag.
    const rightCol = right <= 6 ? right - 1 : right;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const col of [rightCol, rightCol - 1]) {
        if (reserved[row][col]) continue;
        const byte = codewords[bitIndex >> 3];
        const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
        grid[row][col] = bit === 1;
        bitIndex++;
      }
    }
    upward = !upward;
  }
}

function maskFn(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

/** The standard's four penalty rules, used to choose between the eight masks. */
function penalty(grid: boolean[][]): number {
  const size = grid.length;
  let score = 0;

  const runScore = (run: number) => (run >= 5 ? 3 + (run - 5) : 0);
  for (let i = 0; i < size; i++) {
    for (const line of [grid[i], grid.map((row) => row[i])]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        if (line[j] === line[j - 1]) run++;
        else {
          score += runScore(run);
          run = 1;
        }
      }
      score += runScore(run);
    }
  }

  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const cell = grid[r][c];
      if (cell === grid[r][c + 1] && cell === grid[r + 1][c] && cell === grid[r + 1][c + 1]) {
        score += 3;
      }
    }
  }

  // The finder-like 1:1:3:1:1 sequence, with four light modules either side.
  const pattern = [true, false, true, true, true, false, true];
  const hasAt = (line: boolean[], at: number) => {
    for (let i = 0; i < 7; i++) if (line[at + i] !== pattern[i]) return false;
    const before = line.slice(Math.max(0, at - 4), at);
    const after = line.slice(at + 7, at + 11);
    const clear = (part: boolean[]) => part.length === 4 && part.every((v) => !v);
    return clear(before) || clear(after);
  };
  for (let i = 0; i < size; i++) {
    for (const line of [grid[i], grid.map((row) => row[i])]) {
      for (let j = 0; j + 7 <= size; j++) if (hasAt(line, j)) score += 40;
    }
  }

  const dark = grid.flat().filter(Boolean).length;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

function applyFormat(grid: boolean[][], level: EccLevel, mask: number): void {
  const size = grid.length;
  const bits = formatBits(level, mask);
  for (let i = 0; i < 15; i++) {
    const bit = ((bits >> i) & 1) === 1;
    // Copy one: down the left column and along the top row, skipping timing.
    if (i < 6) grid[i][8] = bit;
    else if (i === 6) grid[7][8] = bit;
    else if (i === 7) grid[8][8] = bit;
    else if (i === 8) grid[8][7] = bit;
    else grid[8][14 - i] = bit;

    // Copy two, so the format survives damage to either corner.
    if (i < 8) grid[8][size - 1 - i] = bit;
    else grid[size - 15 + i][8] = bit;
  }
}

export interface QrMatrix {
  size: number;
  /** Row-major, true meaning a dark module. */
  modules: boolean[][];
  version: number;
  level: EccLevel;
}

/**
 * Encode `text` as a QR matrix.
 *
 * Throws when the text is longer than version 10 holds — the caller is passing
 * a URL, so that is a bug rather than something to render half of.
 */
export function encodeQr(text: string, level: EccLevel = "M"): QrMatrix {
  if (text.length === 0) throw new Error("Nothing to encode.");
  const byteLength = new TextEncoder().encode(text).length;
  const version = pickVersion(byteLength, level);
  if (version === 0) {
    throw new Error(`${byteLength} bytes is past what a version 10 QR holds at level ${level}.`);
  }

  const codewords = interleave(toCodewords(text, version, level), version, level);
  const { grid, reserved } = buildSkeleton(version);
  placeData(grid, reserved, codewords);

  let best: boolean[][] | null = null;
  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = grid.map((row, r) =>
      // Structure modules are never masked; data modules flip where the mask says.
      row.map((cell, c) => (cell === true) !== (!reserved[r][c] && maskFn(mask, r, c))),
    );
    applyFormat(candidate, level, mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
      bestMask = mask;
    }
  }

  void bestMask;
  return { size: grid.length, modules: best!, version, level };
}
