/**
 * How one tablet is set up to show the table.
 *
 * These are per-device display preferences, not room state: two tablets in
 * different rooms should not fight over a theme, and nobody's phone should be
 * restyled because someone changed the table. They live in that device's
 * `localStorage` and never go over the wire.
 *
 * Bot difficulty is the deliberate exception — it changes how the game is
 * played, so it belongs to the room and is set through `/control`.
 */

export type TableTheme = "felt" | "midnight" | "slate" | "walnut" | "contrast";
export type TableLayout = "edges" | "corners";
export type TableDensity = "cosy" | "normal" | "compact";

export interface TableSettings {
  theme: TableTheme;
  /** Seats along the four sides, or tucked into the four corners. */
  layout: TableLayout;
  /** Multiplies every text size on the display. */
  fontScale: number;
  density: TableDensity;
  /** Multiplies the QR code edge length. */
  qrScale: number;
}

export const THEME_LABEL: Record<TableTheme, string> = {
  felt: "Card room",
  midnight: "Midnight",
  slate: "Slate",
  walnut: "Walnut",
  contrast: "High contrast",
};

export const LAYOUT_LABEL: Record<TableLayout, string> = {
  edges: "Seats on the edges",
  corners: "Seats in the corners",
};

export const DENSITY_LABEL: Record<TableDensity, string> = {
  cosy: "Roomy",
  normal: "Normal",
  compact: "Compact",
};

export const DEFAULT_TABLE_SETTINGS: TableSettings = {
  theme: "felt",
  layout: "edges",
  fontScale: 1,
  density: "normal",
  qrScale: 1,
};

export const FONT_SCALE_RANGE = { min: 0.8, max: 1.6, step: 0.05 } as const;
export const QR_SCALE_RANGE = { min: 0.6, max: 2, step: 0.1 } as const;

const THEMES: TableTheme[] = ["felt", "midnight", "slate", "walnut", "contrast"];
const LAYOUTS: TableLayout[] = ["edges", "corners"];
const DENSITIES: TableDensity[] = ["cosy", "normal", "compact"];

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

/**
 * Read settings back out of whatever was stored.
 *
 * Deliberately total: a display left running for a week should not end up on
 * an error screen because a stored value went stale between releases. Anything
 * unrecognised falls back to its default.
 */
export function parseTableSettings(raw: unknown): TableSettings {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    theme: THEMES.includes(input.theme as TableTheme)
      ? (input.theme as TableTheme)
      : DEFAULT_TABLE_SETTINGS.theme,
    layout: LAYOUTS.includes(input.layout as TableLayout)
      ? (input.layout as TableLayout)
      : DEFAULT_TABLE_SETTINGS.layout,
    fontScale: clamp(
      input.fontScale,
      FONT_SCALE_RANGE.min,
      FONT_SCALE_RANGE.max,
      DEFAULT_TABLE_SETTINGS.fontScale,
    ),
    density: DENSITIES.includes(input.density as TableDensity)
      ? (input.density as TableDensity)
      : DEFAULT_TABLE_SETTINGS.density,
    qrScale: clamp(
      input.qrScale,
      QR_SCALE_RANGE.min,
      QR_SCALE_RANGE.max,
      DEFAULT_TABLE_SETTINGS.qrScale,
    ),
  };
}

/** The same parse, from the JSON string localStorage actually holds. */
export function readTableSettings(stored: string | null): TableSettings {
  if (!stored) return { ...DEFAULT_TABLE_SETTINGS };
  try {
    return parseTableSettings(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_TABLE_SETTINGS };
  }
}

export const TABLE_SETTINGS_KEY = "bigtwo_table_settings";
