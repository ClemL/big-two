import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TABLE_SETTINGS,
  FONT_SCALE_RANGE,
  QR_SCALE_RANGE,
  parseTableSettings,
  readTableSettings,
} from "../lib/tableSettings.ts";

/**
 * A table display is left running for an evening, and its settings outlive
 * releases. Parsing has to be total: anything unrecognised falls back rather
 * than throwing, because the alternative is a blank screen in the middle of a
 * real table.
 */

test("nothing stored gives the defaults", () => {
  assert.deepEqual(readTableSettings(null), DEFAULT_TABLE_SETTINGS);
  assert.deepEqual(readTableSettings(""), DEFAULT_TABLE_SETTINGS);
});

test("malformed storage falls back instead of throwing", () => {
  for (const raw of ["{", "null", "[]", '"felt"', "12", "undefined"]) {
    assert.deepEqual(readTableSettings(raw), DEFAULT_TABLE_SETTINGS, `input ${raw}`);
  }
});

test("unknown enum values fall back one field at a time", () => {
  const parsed = parseTableSettings({
    theme: "chartreuse",
    layout: "diagonal",
    density: "airy",
    fontScale: 1.2,
    qrScale: 1.5,
  });
  assert.equal(parsed.theme, DEFAULT_TABLE_SETTINGS.theme);
  assert.equal(parsed.layout, DEFAULT_TABLE_SETTINGS.layout);
  assert.equal(parsed.density, DEFAULT_TABLE_SETTINGS.density);
  // The valid fields in the same object survive.
  assert.equal(parsed.fontScale, 1.2);
  assert.equal(parsed.qrScale, 1.5);
});

test("scales are clamped to what the display can actually show", () => {
  assert.equal(parseTableSettings({ fontScale: 99 }).fontScale, FONT_SCALE_RANGE.max);
  assert.equal(parseTableSettings({ fontScale: -4 }).fontScale, FONT_SCALE_RANGE.min);
  assert.equal(parseTableSettings({ qrScale: 99 }).qrScale, QR_SCALE_RANGE.max);
  assert.equal(parseTableSettings({ qrScale: 0 }).qrScale, QR_SCALE_RANGE.min);
});

test("a non-numeric or non-finite scale falls back rather than poisoning the CSS", () => {
  for (const bad of ["1.2", null, undefined, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
    assert.equal(parseTableSettings({ fontScale: bad }).fontScale, DEFAULT_TABLE_SETTINGS.fontScale);
    assert.equal(parseTableSettings({ qrScale: bad }).qrScale, DEFAULT_TABLE_SETTINGS.qrScale);
  }
});

test("valid settings round-trip through storage unchanged", () => {
  const chosen = {
    theme: "midnight",
    layout: "corners",
    density: "compact",
    fontScale: 1.35,
    qrScale: 1.7,
  } as const;
  assert.deepEqual(readTableSettings(JSON.stringify(chosen)), chosen);
});

test("every theme, layout and density in the labels is accepted by the parser", async () => {
  const { THEME_LABEL, LAYOUT_LABEL, DENSITY_LABEL } = await import("../lib/tableSettings.ts");
  for (const theme of Object.keys(THEME_LABEL)) {
    assert.equal(parseTableSettings({ theme }).theme, theme, `theme ${theme}`);
  }
  for (const layout of Object.keys(LAYOUT_LABEL)) {
    assert.equal(parseTableSettings({ layout }).layout, layout, `layout ${layout}`);
  }
  for (const density of Object.keys(DENSITY_LABEL)) {
    assert.equal(parseTableSettings({ density }).density, density, `density ${density}`);
  }
});
