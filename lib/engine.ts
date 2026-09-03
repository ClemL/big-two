/**
 * Round state machine for a 4-player game.
 *
 * A round ends the moment one player sheds their last card; the remaining
 * hands are scored with the Hong Kong penalty multipliers.
 */

import type { Card } from "./cards.ts";
import type { Combo } from "./combos.ts";
import { THREE_OF_DIAMONDS, deal, findStartingPlayer, mulberry32 } from "./cards.ts";
import { beats, identify, legalMoves } from "./combos.ts";
import { roundDeltas } from "./scoring.ts";

export const PLAYER_COUNT = 4;
export const DEFAULT_NAMES = ["You", "Ada", "Bruce", "Chan"] as const;

export interface PlayerState {
  index: number;
  name: string;
  isHuman: boolean;
  hand: Card[];
}

export interface LogEntry {
  player: number;
  kind: "play" | "pass" | "clear" | "win";
  text: string;
}

export interface TablePlay {
  player: number;
  combo: Combo;
}

export interface GameState {
  players: PlayerState[];
  /** Whose turn it is. */
  turn: number;
  /** Combination that must be beaten; null when the table is clear. */
  table: TablePlay | null;
  /** Player who owns the current pile and leads once everyone else passes. */
  leader: number;
  /** Players who have passed on the current trick. */
  passed: boolean[];
  /** The very first play of a round must contain 3♦. */
  openingPlay: boolean;
  log: LogEntry[];
  finished: boolean;
  winner: number | null;
  scores: number[];
  lastDeltas: number[] | null;
  roundNumber: number;
  seed: number;
}

export interface NewRoundOptions {
  seed?: number;
  scores?: number[];
  roundNumber?: number;
  names?: readonly string[];
}

export function startRound(options: NewRoundOptions = {}): GameState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const names = options.names ?? DEFAULT_NAMES;
  const hands = deal(mulberry32(seed));
  const starter = findStartingPlayer(hands);

  return {
    players: hands.map((hand, index) => ({
      index,
      name: names[index] ?? `Player ${index + 1}`,
      isHuman: index === 0,
      hand,
    })),
    turn: starter,
    table: null,
    leader: starter,
    passed: [false, false, false, false],
    openingPlay: true,
    log: [],
    finished: false,
    winner: null,
    scores: options.scores ? options.scores.slice() : [0, 0, 0, 0],
    lastDeltas: null,
    roundNumber: options.roundNumber ?? 1,
    seed,
  };
}

export function requiredCardId(state: GameState): string | null {
  return state.openingPlay ? THREE_OF_DIAMONDS : null;
}

export function legalMovesFor(state: GameState, player: number): Combo[] {
  if (state.finished || state.turn !== player) return [];
  return legalMoves(state.players[player].hand, {
    current: state.table?.combo ?? null,
    mustInclude: requiredCardId(state),
  });
}

export function canPass(state: GameState, player: number): boolean {
  if (state.finished || state.turn !== player) return false;
  // Leading the trick — and the opening play — must be a real play.
  return state.table !== null;
}

/** Why a selection is not playable, or null when it is legal. */
export function validatePlay(state: GameState, player: number, cards: readonly Card[]): string | null {
  if (state.finished) return "The round is over.";
  if (state.turn !== player) return "It is not your turn.";
  const combo = identify(cards);
  if (!combo) return "That is not a legal combination.";
  const required = requiredCardId(state);
  if (required && !combo.cards.some((c) => c.id === required)) {
    return "The opening play of the round must contain 3♦.";
  }
  if (!beats(combo, state.table?.combo ?? null)) {
    return state.table && combo.size !== state.table.combo.size
      ? `You must play ${state.table.combo.size} card${state.table.combo.size > 1 ? "s" : ""}.`
      : "That does not beat the cards on the table.";
  }
  return null;
}

function nextActivePlayer(state: GameState, from: number): number {
  let next = from;
  for (let i = 0; i < PLAYER_COUNT; i++) {
    next = (next + 1) % PLAYER_COUNT;
    if (!state.passed[next] && state.players[next].hand.length > 0) return next;
  }
  return from;
}

function clone(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: p.hand.slice() })),
    passed: state.passed.slice(),
    log: state.log.slice(),
    scores: state.scores.slice(),
  };
}

export function applyPlay(state: GameState, player: number, cards: readonly Card[]): GameState {
  const problem = validatePlay(state, player, cards);
  if (problem) throw new Error(problem);
  const combo = identify(cards)!;
  const next = clone(state);
  const ids = new Set(combo.cards.map((c) => c.id));
  const hand = next.players[player];
  hand.hand = hand.hand.filter((c) => !ids.has(c.id));

  next.table = { player, combo };
  next.leader = player;
  next.passed = [false, false, false, false];
  next.openingPlay = false;
  next.log.push({
    player,
    kind: "play",
    text: `${hand.name} played ${combo.cards.map((c) => c.id).join(" ")}`,
  });

  if (hand.hand.length === 0) {
    next.finished = true;
    next.winner = player;
    const deltas = roundDeltas(
      next.players.map((p) => p.hand.length),
      player,
    );
    next.lastDeltas = deltas;
    next.scores = next.scores.map((s, i) => s + deltas[i]);
    next.log.push({ player, kind: "win", text: `${hand.name} went out and wins the round` });
    return next;
  }

  next.turn = nextActivePlayer(next, player);
  return next;
}

export function applyPass(state: GameState, player: number): GameState {
  if (!canPass(state, player)) throw new Error("You cannot pass when you are leading the trick.");
  const next = clone(state);
  next.passed[player] = true;
  next.log.push({ player, kind: "pass", text: `${next.players[player].name} passed` });

  const stillIn = next.passed.filter((p) => !p).length;
  if (stillIn <= 1) {
    // Everybody folded to the pile owner: the table clears and they lead again.
    next.table = null;
    next.passed = [false, false, false, false];
    next.turn = next.leader;
    next.log.push({
      player: next.leader,
      kind: "clear",
      text: `Table cleared — ${next.players[next.leader].name} leads`,
    });
    return next;
  }

  next.turn = nextActivePlayer(next, player);
  return next;
}

export function nextRound(state: GameState): GameState {
  return startRound({
    scores: state.scores,
    roundNumber: state.roundNumber + 1,
    names: state.players.map((p) => p.name),
  });
}
