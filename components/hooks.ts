"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as sound from "@/lib/sound";

/**
 * Alert a player that it is their turn.
 *
 * With a tablet acting as the table, phones spend the game face down, so the
 * signal has to be audible and physical rather than visual.
 */
export function useTurnSignal(isMyTurn: boolean, enabled = true): void {
  const wasMyTurn = useRef(isMyTurn);
  useEffect(() => {
    if (enabled && isMyTurn && !wasMyTurn.current) {
      sound.play("turn");
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([120, 60, 120]);
      }
    }
    wasMyTurn.current = isMyTurn;
  }, [isMyTurn, enabled]);
}

/** Announce a change of turn on the shared table. */
export function useTableTurnSignal(turn: number, finished: boolean): void {
  const previous = useRef(turn);
  useEffect(() => {
    if (!finished && turn !== previous.current) sound.play("turn");
    previous.current = turn;
  }, [turn, finished]);
}

export interface GameKeyHandlers {
  enabled: boolean;
  onPlay: () => void;
  onPass: () => void;
  onHint: () => void;
  onClear: () => void;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Desktop keyboard control.
 *
 * Cards are already buttons, so Tab and Space work without help; these are the
 * shortcuts that save reaching for the mouse, plus arrow keys to walk the hand.
 */
export function useGameKeys({ enabled, onPlay, onPass, onHint, onClear }: GameKeyHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const cards = Array.from(document.querySelectorAll<HTMLElement>(".hand .card"));
        if (cards.length === 0) return;
        const index = cards.indexOf(document.activeElement as HTMLElement);
        const step = event.key === "ArrowRight" ? 1 : -1;
        const next = index === -1 ? (step === 1 ? 0 : cards.length - 1) : index + step;
        const target = cards[Math.max(0, Math.min(cards.length - 1, next))];
        target?.focus();
        event.preventDefault();
        return;
      }

      if (!enabled) return;
      const key = event.key.toLowerCase();
      if (event.key === "Enter") {
        onPlay();
        event.preventDefault();
      } else if (key === "p") {
        onPass();
        event.preventDefault();
      } else if (key === "h") {
        onHint();
        event.preventDefault();
      } else if (event.key === "Escape") {
        onClear();
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onPlay, onPass, onHint, onClear]);
}

/**
 * Pass automatically when the hand holds no legal reply.
 *
 * There is no decision to make in that position, so making the player tap is
 * only ceremony. The short delay is so the table can be read first.
 */
export function useAutoPass(shouldPass: boolean, pass: () => void, delayMs = 900): void {
  useEffect(() => {
    if (!shouldPass) return;
    const timer = setTimeout(pass, delayMs);
    return () => clearTimeout(timer);
  }, [shouldPass, pass, delayMs]);
}


/**
 * Keep items in the render for a moment after they leave the list, so they can
 * animate out. React unmounts immediately otherwise, and a trick that vanishes
 * between frames is exactly the thing players complain they missed.
 */
export function useLingering<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  ms = 380,
): T[] {
  const [leaving, setLeaving] = useState<T[]>([]);
  const previous = useRef<T[]>([...items]);
  const signature = items.map(keyOf).join("|");

  useEffect(() => {
    const currentKeys = new Set(items.map(keyOf));
    const gone = previous.current.filter((item) => !currentKeys.has(keyOf(item)));
    previous.current = [...items];
    if (gone.length === 0) return;

    setLeaving((old) => [...old, ...gone]);
    const goneKeys = new Set(gone.map(keyOf));
    const timer = setTimeout(
      () => setLeaving((old) => old.filter((item) => !goneKeys.has(keyOf(item)))),
      ms,
    );
    return () => clearTimeout(timer);
    // Identity of `items` changes every render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ms]);

  return leaving;
}

/**
 * Report whether this is a second tap on the same target inside the window.
 *
 * Used to play a single card by tapping it twice, without breaking the plain
 * tap-to-select-and-deselect behaviour a slower second tap should still get.
 */
export function useDoubleTap(windowMs = 500): (id: string) => boolean {
  const last = useRef<{ id: string; at: number } | null>(null);
  return useMemo(
    () => (id: string) => {
      const now = Date.now();
      const repeat = last.current !== null && last.current.id === id && now - last.current.at < windowMs;
      last.current = repeat ? null : { id, at: now };
      return repeat;
    },
    [windowMs],
  );
}

/** Pre-select the suggested play as soon as the turn arrives. */
export function useAutoHint(isMyTurn: boolean, hint: () => void, enabled = true): void {
  const wasMyTurn = useRef(isMyTurn);
  useEffect(() => {
    if (enabled && isMyTurn && !wasMyTurn.current) hint();
    wasMyTurn.current = isMyTurn;
  }, [isMyTurn, hint, enabled]);
}


/**
 * Hold the screen awake while a game is in front of you.
 *
 * A tablet propped in the middle of the table dims and sleeps mid-round
 * otherwise, and a phone that sleeps stops polling, which is what used to hand
 * a seat to the AI. The lock is dropped by the browser whenever the page is
 * hidden, so it has to be re-taken on the way back.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Denied, unsupported, or the tab is not visible. Not worth surfacing.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
