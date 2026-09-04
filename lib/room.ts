/**
 * Multiplayer room model.
 *
 * The same shape as the rest of `lib/`: pure functions over a room object,
 * returning a new room rather than mutating one. Hashing is deliberately kept
 * out — the caller passes hashes in — so this module stays synchronous and
 * testable without a crypto implementation.
 *
 * The server is the only authority. Two rules follow from that and must not be
 * relaxed:
 *
 *   1. The deal seed never leaves the server. `mulberry32(seed)` reproduces
 *      every hand, so publishing the seed publishes the whole deal.
 *   2. A client is only ever sent its own cards. Everyone else is a count.
 */

import type { Card } from "./cards.ts";
import type { AiStyle } from "./ai.ts";
import type { GameState, TablePlay } from "./engine.ts";
import { chooseMove } from "./ai.ts";
import {
  PLAYER_COUNT,
  applyPass,
  applyPlay,
  canPass,
  legalMovesFor,
  nextRound,
  startRound,
  validatePlay,
} from "./engine.ts";

export const SEAT_COUNT = PLAYER_COUNT;
/** A seat is considered away, and played by the AI, after this long silent. */
export const SEAT_IDLE_MS = 3 * 60 * 1000;

export interface SeatRecord {
  name: string;
  /** null means nobody has claimed the seat, so the AI plays it. */
  tokenHash: string | null;
  lastSeen: number;
}

export interface Room {
  id: string;
  /** Bumped on every accepted change; clients poll this and use it for CAS. */
  version: number;
  passwordHash: string;
  salt: string;
  seats: SeatRecord[];
  state: GameState;
  aiStyle: AiStyle;
  createdAt: number;
  updatedAt: number;
}

export type RoomResult =
  | { ok: true; room: Room }
  | { ok: false; error: string; status: number };

const DEFAULT_SEAT_NAMES = ["Seat 1", "Seat 2", "Seat 3", "Seat 4"];

export interface CreateRoomOptions {
  id: string;
  passwordHash: string;
  salt: string;
  seed?: number;
  aiStyle?: AiStyle;
  now?: number;
}

export function createRoom(options: CreateRoomOptions): Room {
  const now = options.now ?? Date.now();
  return {
    id: options.id,
    version: 1,
    passwordHash: options.passwordHash,
    salt: options.salt,
    seats: DEFAULT_SEAT_NAMES.map((name) => ({ name, tokenHash: null, lastSeen: 0 })),
    state: startRound({ seed: options.seed, names: DEFAULT_SEAT_NAMES }),
    aiStyle: options.aiStyle ?? "weakest",
    createdAt: now,
    updatedAt: now,
  };
}

function bump(room: Room, now: number): Room {
  return { ...room, version: room.version + 1, updatedAt: now };
}

export function isSeatClaimed(seat: SeatRecord): boolean {
  return seat.tokenHash !== null;
}

/** Seats a human is actually sitting at and still present for. */
export function activeSeats(room: Room, now = Date.now()): number[] {
  return room.seats
    .map((seat, i) => ({ seat, i }))
    .filter(({ seat }) => isSeatClaimed(seat) && now - seat.lastSeen < SEAT_IDLE_MS)
    .map(({ i }) => i);
}

/** True when the AI should take this seat's turn. */
export function seatIsAutomated(room: Room, index: number, now = Date.now()): boolean {
  const seat = room.seats[index];
  return !isSeatClaimed(seat) || now - seat.lastSeen >= SEAT_IDLE_MS;
}

export function claimSeat(
  room: Room,
  index: number,
  tokenHash: string,
  name: string,
  now = Date.now(),
): RoomResult {
  if (!Number.isInteger(index) || index < 0 || index >= SEAT_COUNT) {
    return { ok: false, error: "No such seat.", status: 400 };
  }
  const seat = room.seats[index];
  if (isSeatClaimed(seat) && now - seat.lastSeen < SEAT_IDLE_MS) {
    return { ok: false, error: "That seat is taken.", status: 409 };
  }
  const trimmed = name.trim().slice(0, 16) || DEFAULT_SEAT_NAMES[index];
  const seats = room.seats.slice();
  seats[index] = { name: trimmed, tokenHash, lastSeen: now };
  const state = {
    ...room.state,
    players: room.state.players.map((p) => (p.index === index ? { ...p, name: trimmed } : p)),
  };
  return { ok: true, room: bump({ ...room, seats, state }, now) };
}

export function releaseSeat(room: Room, index: number, now = Date.now()): Room {
  const seats = room.seats.slice();
  seats[index] = { name: DEFAULT_SEAT_NAMES[index], tokenHash: null, lastSeen: 0 };
  const state = {
    ...room.state,
    players: room.state.players.map((p) =>
      p.index === index ? { ...p, name: DEFAULT_SEAT_NAMES[index] } : p,
    ),
  };
  return bump({ ...room, seats, state }, now);
}

export function touchSeat(room: Room, index: number, now = Date.now()): Room {
  const seats = room.seats.slice();
  seats[index] = { ...seats[index], lastSeen: now };
  // Presence is not a state change, so the version deliberately stays put —
  // otherwise every heartbeat would wake every other client.
  return { ...room, seats };
}

/** Which seat, if any, this token owns. */
export function seatForToken(room: Room, tokenHash: string | null): number | null {
  if (!tokenHash) return null;
  const index = room.seats.findIndex((seat) => seat.tokenHash === tokenHash);
  return index === -1 ? null : index;
}

export type Intent =
  | { kind: "play"; cardIds: string[] }
  | { kind: "pass" }
  | { kind: "nextRound" };

/**
 * Advance through any seat the AI is covering.
 *
 * Only runs while at least one human is seated: an empty room should sit
 * waiting for players, not deal rounds to itself forever.
 */
export function advanceAutomatedSeats(room: Room, now = Date.now(), rng = Math.random): Room {
  if (activeSeats(room, now).length === 0) return room;
  let state = room.state;
  let guard = 0;
  while (!state.finished && seatIsAutomated(room, state.turn, now)) {
    if (guard++ > 200) break;
    const actor = state.turn;
    const move = chooseMove(state, actor, room.aiStyle, rng);
    state = move ? applyPlay(state, actor, move.cards) : applyPass(state, actor);
  }
  return state === room.state ? room : { ...room, state };
}

function cardsFromIds(state: GameState, seat: number, cardIds: readonly string[]): Card[] | null {
  const hand = state.players[seat].hand;
  const picked: Card[] = [];
  const seen = new Set<string>();
  for (const id of cardIds) {
    if (seen.has(id)) return null;
    seen.add(id);
    const card = hand.find((c) => c.id === id);
    // Only cards actually in this seat's hand are playable, whatever the
    // client sent.
    if (!card) return null;
    picked.push(card);
  }
  return picked;
}

export function applyIntent(
  room: Room,
  seat: number,
  intent: Intent,
  now = Date.now(),
  rng = Math.random,
): RoomResult {
  const withPresence = touchSeat(room, seat, now);
  const state = withPresence.state;

  if (intent.kind === "nextRound") {
    if (!state.finished) return { ok: false, error: "The round is still going.", status: 409 };
    const next = { ...withPresence, state: nextRound(state) };
    return { ok: true, room: bump(advanceAutomatedSeats(next, now, rng), now) };
  }

  if (state.finished) return { ok: false, error: "The round is over.", status: 409 };
  if (state.turn !== seat) return { ok: false, error: "It is not your turn.", status: 409 };

  if (intent.kind === "pass") {
    if (!canPass(state, seat)) {
      return { ok: false, error: "You are leading — you have to play.", status: 400 };
    }
    const played = { ...withPresence, state: applyPass(state, seat) };
    return { ok: true, room: bump(advanceAutomatedSeats(played, now, rng), now) };
  }

  const cards = cardsFromIds(state, seat, intent.cardIds);
  if (!cards || cards.length === 0) {
    return { ok: false, error: "Those cards are not in your hand.", status: 400 };
  }
  // The client checks legality too, for a fast error message. This is the check
  // that counts.
  const problem = validatePlay(state, seat, cards);
  if (problem) return { ok: false, error: problem, status: 400 };

  const played = { ...withPresence, state: applyPlay(state, seat, cards) };
  return { ok: true, room: bump(advanceAutomatedSeats(played, now, rng), now) };
}

/* ------------------------------------------------------------------------ */
/* Views sent to clients                                                      */
/* ------------------------------------------------------------------------ */

export interface PublicSeat {
  index: number;
  name: string;
  cards: number;
  claimed: boolean;
  automated: boolean;
  /** Present only for the seat the request belongs to. */
  hand?: Card[];
}

export interface PublicRoom {
  id: string;
  version: number;
  seat: number | null;
  seats: PublicSeat[];
  turn: number;
  table: TablePlay | null;
  leader: number;
  passed: boolean[];
  openingPlay: boolean;
  finished: boolean;
  winner: number | null;
  scores: number[];
  lastDeltas: number[] | null;
  roundNumber: number;
  log: GameState["log"];
  aiStyle: AiStyle;
  /** Legal moves are computed client side from the hand; this is a courtesy. */
  yourTurn: boolean;
}

/** The room as one seat is allowed to see it. Never includes the seed. */
export function publicRoom(room: Room, seat: number | null, now = Date.now()): PublicRoom {
  const state = room.state;
  return {
    id: room.id,
    version: room.version,
    seat,
    seats: room.seats.map((record, i) => ({
      index: i,
      name: record.name,
      cards: state.players[i].hand.length,
      claimed: isSeatClaimed(record),
      automated: seatIsAutomated(room, i, now),
      hand: i === seat ? state.players[i].hand : undefined,
    })),
    turn: state.turn,
    table: state.table,
    leader: state.leader,
    passed: state.passed,
    openingPlay: state.openingPlay,
    finished: state.finished,
    winner: state.winner,
    scores: state.scores,
    lastDeltas: state.lastDeltas,
    roundNumber: state.roundNumber,
    log: state.log,
    aiStyle: room.aiStyle,
    yourTurn: seat !== null && !state.finished && state.turn === seat,
  };
}

/** The cheap payload clients poll: enough to know whether to refetch. */
export interface RoomVersion {
  version: number;
  turn: number;
  finished: boolean;
  seats: { claimed: boolean; automated: boolean; name: string }[];
}

export function roomVersion(room: Room, now = Date.now()): RoomVersion {
  return {
    version: room.version,
    turn: room.state.turn,
    finished: room.state.finished,
    seats: room.seats.map((record, i) => ({
      claimed: isSeatClaimed(record),
      automated: seatIsAutomated(room, i, now),
      name: record.name,
    })),
  };
}

/** Used by the client to decide whether the Pass button is available. */
export function seatCanPass(room: Room, seat: number): boolean {
  return canPass(room.state, seat);
}

export function seatLegalMoveCount(room: Room, seat: number): number {
  return legalMovesFor(room.state, seat).length;
}
