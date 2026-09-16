import test from "node:test";
import assert from "node:assert/strict";
import { encodeQr } from "../lib/qr.ts";

/**
 * The encoder is only worth having if real scanners read it, and the parts that
 * go wrong quietly — error correction, mask choice, the version-info blocks —
 * fail by producing a code that some readers manage and others do not.
 *
 * `npm test` has no decoder to check against, so these pin the structural
 * properties instead. The round-trip against an independent decoder is in
 * `bench/qr-decode.mjs`, which is how the two real bugs here were found.
 */

function finderAt(m: ReturnType<typeof encodeQr>, row: number, col: number): boolean {
  const want = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      if (m.modules[row + r][col + c] !== (want[r][c] === 1)) return false;
    }
  }
  return true;
}

test("the three finder patterns are where a scanner looks for them", () => {
  for (const text of ["A", "https://example.com/room/ABC123/j/0123456789abcdef"]) {
    const m = encodeQr(text);
    assert.ok(finderAt(m, 0, 0), "top left");
    assert.ok(finderAt(m, 0, m.size - 7), "top right");
    assert.ok(finderAt(m, m.size - 7, 0), "bottom left");
  }
});

test("timing patterns alternate between the finders", () => {
  const m = encodeQr("https://example.com/room/ABC123/j/0123456789abcdef");
  for (let i = 8; i < m.size - 8; i++) {
    assert.equal(m.modules[6][i], i % 2 === 0, `row timing at ${i}`);
    assert.equal(m.modules[i][6], i % 2 === 0, `column timing at ${i}`);
  }
});

test("the dark module is set, as every symbol requires", () => {
  const m = encodeQr("anything");
  assert.equal(m.modules[m.size - 8][8], true);
});

test("the symbol is square and sized to its version", () => {
  for (const level of ["L", "M"] as const) {
    for (const length of [1, 20, 60, 120, 200]) {
      const m = encodeQr("x".repeat(length), level);
      assert.equal(m.size, m.version * 4 + 17);
      assert.equal(m.modules.length, m.size);
      for (const row of m.modules) assert.equal(row.length, m.size);
    }
  }
});

test("the version grows with the payload and never exceeds ten", () => {
  let previous = 0;
  for (let length = 1; length <= 250; length += 7) {
    let m;
    try {
      m = encodeQr("x".repeat(length), "L");
    } catch {
      // Past version 10 the encoder refuses rather than truncating.
      continue;
    }
    assert.ok(m.version >= previous, "version never shrinks as the payload grows");
    assert.ok(m.version >= 1 && m.version <= 10);
    previous = m.version;
  }
});

test("alignment patterns survive crossing the timing pattern", () => {
  // Version 7 is the first with a centre at (6, 22): it sits on the timing run
  // and must still be drawn. Skipping it produced codes no scanner could read.
  // Level M holds 106 bytes at version 6, so 120 is the first size past it.
  const m = encodeQr("x".repeat(120), "M");
  assert.ok(m.version >= 7, `expected version 7 or more, got ${m.version}`);
  const centre = 22;
  assert.equal(m.modules[6][centre], true, "alignment centre is dark");
  for (let d = -2; d <= 2; d++) {
    assert.equal(m.modules[6 + 2][centre + d], true, "alignment bottom edge");
    assert.equal(m.modules[6 - 2][centre + d], true, "alignment top edge");
  }
  assert.equal(m.modules[6 + 1][centre + 1], false, "alignment inner ring is light");
});

test("a payload past version 10 is refused rather than silently cut", () => {
  assert.throws(() => encodeQr("x".repeat(400), "M"));
  assert.throws(() => encodeQr(""));
});

test("encoding is deterministic", () => {
  const text = "https://example.com/room/ABC123/j/0123456789abcdef";
  assert.deepEqual(encodeQr(text).modules, encodeQr(text).modules);
});

test("different payloads give different symbols", () => {
  const a = encodeQr("https://example.com/room/ABC123/j/1111111111111111");
  const b = encodeQr("https://example.com/room/ABC123/j/2222222222222222");
  assert.notDeepEqual(a.modules, b.modules);
});
