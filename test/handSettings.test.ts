import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HAND_LAYOUT,
  HAND_LAYOUT_LABEL,
  arcAngle,
  readHandLayout,
} from "../lib/handSettings.ts";

test("an unknown or missing stored layout falls back to the fan", () => {
  for (const raw of [null, "", "spiral", "FAN", "{}", "0"]) {
    assert.equal(readHandLayout(raw), DEFAULT_HAND_LAYOUT, `input ${JSON.stringify(raw)}`);
  }
});

test("every layout offered in the picker is accepted by the reader", () => {
  for (const key of Object.keys(HAND_LAYOUT_LABEL)) {
    assert.equal(readHandLayout(key), key);
  }
});

test("an arc is symmetric about its middle", () => {
  const count = 13;
  for (let i = 0; i < count; i++) {
    const mirrored = arcAngle(count - 1 - i, count);
    assert.ok(
      Math.abs(arcAngle(i, count) + mirrored) < 1e-9,
      `card ${i} should mirror card ${count - 1 - i}`,
    );
  }
  // An odd count puts one card upright in the centre.
  assert.equal(arcAngle(6, 13), 0);
});

test("the arc turns monotonically from one end to the other", () => {
  const count = 13;
  for (let i = 1; i < count; i++) {
    assert.ok(arcAngle(i, count) > arcAngle(i - 1, count), `card ${i} turns further than ${i - 1}`);
  }
});

test("a hand too small to fan is left upright", () => {
  assert.equal(arcAngle(0, 1), 0);
  assert.equal(arcAngle(0, 0), 0);
});

test("a short hand is not spread as far as a full one", () => {
  // Dividing a fixed sweep evenly would turn the end card of a three-card hand
  // as far as the end card of thirteen, which looks broken.
  assert.ok(Math.abs(arcAngle(0, 3)) < Math.abs(arcAngle(0, 13)));
});

test("no card in a full hand is turned far enough to read sideways", () => {
  for (let count = 2; count <= 13; count++) {
    for (let i = 0; i < count; i++) {
      assert.ok(Math.abs(arcAngle(i, count)) <= 16, `count ${count}, card ${i}`);
    }
  }
});
