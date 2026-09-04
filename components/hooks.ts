"use client";

import { useEffect, useRef } from "react";
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
