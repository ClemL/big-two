import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../lib/cards.ts";
import { legalMovesFor } from "../lib/engine.ts";
import {
  SEAT_IDLE_MS,
  TABLE_IDLE_MS,
  applyTableIntent,
  claimTableSeat,
  isTableSeatToken,
  releaseTableSeat,
  tableSeatActive,
  advanceAutomatedSeats,
  applyIntent,
  claimSeat,
  createRoom,
  publicRoom,
  releaseSeat,
  roomVersion,
  seatForToken,
  seatIsAutomated,
  touchSeat,
  type Room,
} from "../lib/room.ts";

const T0 = 1_700_000_000_000;

function room(seed = 42): Room {
  return createRoom({ id: "TEST01", passwordHash: "hash", salt: "salt", seed, now: T0 });
}

/** Seat every player so nothing is automated, for tests about turn handling. */
function seatEveryone(base: Room, now = T0): Room {
  let r = base;
  for (let i = 0; i < 4; i++) {
    const result = claimSeat(r, i, `token${i}`, `P${i}`, now);
    assert.ok(result.ok);
    r = result.room;
  }
  return r;
}

test("a new room has four empty seats and a dealt round", () => {
  const r = room();
  assert.equal(r.seats.length, 4);
  assert.ok(r.seats.every((s) => s.tokenHash === null));
  assert.equal(r.version, 1);
  for (const p of r.state.players) assert.equal(p.hand.length, 13);
});

test("claiming a seat takes it, renames the player and bumps the version", () => {
  const result = claimSeat(room(), 2, "tokenhash", "Kris", T0);
  assert.ok(result.ok);
  assert.equal(result.room.seats[2].tokenHash, "tokenhash");
  assert.equal(result.room.seats[2].name, "Kris");
  assert.equal(result.room.state.players[2].name, "Kris");
  assert.equal(result.room.version, 2);
});

test("a claimed seat cannot be taken by someone else", () => {
  const first = claimSeat(room(), 0, "a", "Kris", T0);
  assert.ok(first.ok);
  const second = claimSeat(first.room, 0, "b", "Srini", T0);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.status, 409);
});

test("a seat silent past the idle window can be reclaimed", () => {
  const first = claimSeat(room(), 0, "a", "Kris", T0);
  assert.ok(first.ok);
  const later = T0 + SEAT_IDLE_MS + 1;
  assert.equal(seatIsAutomated(first.room, 0, later), true);
  const second = claimSeat(first.room, 0, "b", "Srini", later);
  assert.ok(second.ok);
  assert.equal(second.room.seats[0].name, "Srini");
});

test("seats out of range are rejected", () => {
  for (const bad of [-1, 4, 1.5, Number.NaN]) {
    const result = claimSeat(room(), bad, "t", "x", T0);
    assert.equal(result.ok, false);
  }
});

test("a token maps back to exactly one seat", () => {
  const r = seatEveryone(room());
  assert.equal(seatForToken(r, "token2"), 2);
  assert.equal(seatForToken(r, "nope"), null);
  assert.equal(seatForToken(r, null), null);
});

test("releasing a seat hands it back to the AI", () => {
  const claimed = claimSeat(room(), 1, "a", "Kris", T0);
  assert.ok(claimed.ok);
  const freed = releaseSeat(claimed.room, 1, T0);
  assert.equal(freed.seats[1].tokenHash, null);
  assert.equal(freed.seats[1].name, "Seat 2");
  assert.equal(seatIsAutomated(freed, 1, T0), true);
});

test("presence heartbeats do not bump the version", () => {
  const claimed = claimSeat(room(), 0, "a", "Kris", T0);
  assert.ok(claimed.ok);
  const touched = touchSeat(claimed.room, 0, T0 + 1000);
  assert.equal(touched.version, claimed.room.version);
  assert.equal(touched.seats[0].lastSeen, T0 + 1000);
});

test("an empty room never plays itself", () => {
  const r = room();
  const advanced = advanceAutomatedSeats(r, T0, mulberry32(1));
  assert.equal(advanced.state.log.length, 0);
  assert.equal(advanced, r);
});

test("unclaimed seats are played by the AI up to the human's turn", () => {
  // Seat only the player holding 3♦'s left-hand neighbour, so the AI has to
  // open the round and hand the turn over.
  const base = room(42);
  const human = (base.state.turn + 1) % 4;
  const claimed = claimSeat(base, human, "token", "Kris", T0);
  assert.ok(claimed.ok);
  const advanced = advanceAutomatedSeats(claimed.room, T0, mulberry32(7));
  assert.equal(advanced.state.turn, human, "stops on the seated player");
  assert.ok(advanced.state.log.length > 0, "the AI seats played");
});

test("a play is rejected unless it is that seat's turn", () => {
  const r = seatEveryone(room(42));
  const notTurn = (r.state.turn + 1) % 4;
  const card = r.state.players[notTurn].hand[0];
  const result = applyIntent(r, notTurn, { kind: "play", cardIds: [card.id] }, T0);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
});

test("cards that are not in the seat's hand are refused", () => {
  const r = seatEveryone(room(42));
  const seat = r.state.turn;
  const someoneElses = r.state.players[(seat + 1) % 4].hand[0];
  const forged = applyIntent(r, seat, { kind: "play", cardIds: [someoneElses.id] }, T0);
  assert.equal(forged.ok, false);

  const own = r.state.players[seat].hand[0];
  const duplicated = applyIntent(r, seat, { kind: "play", cardIds: [own.id, own.id] }, T0);
  assert.equal(duplicated.ok, false);

  const nonsense = applyIntent(r, seat, { kind: "play", cardIds: ["ZZ"] }, T0);
  assert.equal(nonsense.ok, false);
});

test("an illegal combination is refused by the server, not just the client", () => {
  const r = seatEveryone(room(42));
  const seat = r.state.turn;
  const hand = r.state.players[seat].hand;
  const mismatched = hand.filter((c) => c.rank !== hand[0].rank).slice(0, 1);
  const result = applyIntent(
    r,
    seat,
    { kind: "play", cardIds: [hand[0].id, ...mismatched.map((c) => c.id)] },
    T0,
  );
  assert.equal(result.ok, false);
});

test("a legal play advances the round and bumps the version", () => {
  const r = seatEveryone(room(42));
  const seat = r.state.turn;
  const opening = r.state.players[seat].hand.find((c) => c.id === "3D")!;
  const result = applyIntent(r, seat, { kind: "play", cardIds: [opening.id] }, T0);
  assert.ok(result.ok);
  assert.equal(result.room.version, r.version + 1);
  assert.equal(result.room.state.players[seat].hand.length, 12);
  assert.equal(result.room.state.turn, (seat + 1) % 4);
});

test("the leader cannot pass", () => {
  const r = seatEveryone(room(42));
  const result = applyIntent(r, r.state.turn, { kind: "pass" }, T0);
  assert.equal(result.ok, false);
});

test("nextRound only works once the round is finished", () => {
  const r = seatEveryone(room(42));
  const early = applyIntent(r, 0, { kind: "nextRound" }, T0);
  assert.equal(early.ok, false);
});

test("the public view hides other hands and never leaks the seed", () => {
  const r = seatEveryone(room(42));
  const view = publicRoom(r, 1, T0);
  const serialized = JSON.stringify(view);

  assert.ok(view.seats[1].hand, "own hand is present");
  assert.equal(view.seats[1].hand!.length, 13);
  for (const other of [0, 2, 3]) {
    assert.equal(view.seats[other].hand, undefined, `seat ${other} hand is hidden`);
    assert.equal(view.seats[other].cards, 13, "only the count is shared");
  }
  assert.equal(serialized.includes(String(r.state.seed)), false, "seed is not serialized");
  assert.equal("seed" in (view as unknown as Record<string, unknown>), false);

  // A spectator with no seat sees no hands at all.
  const spectator = publicRoom(r, null, T0);
  assert.ok(spectator.seats.every((s) => s.hand === undefined));
  assert.equal(spectator.yourTurn, false);
});

test("the polled version payload stays tiny and carries no cards", () => {
  const r = seatEveryone(room(42));
  const payload = JSON.stringify(roomVersion(r, T0));
  assert.ok(payload.length < 300, `version payload is ${payload.length} bytes`);
  assert.equal(payload.includes('"hand"'), false);
});

test("a full round can be played out through intents alone", () => {
  let r = seatEveryone(room(9));
  const rng = mulberry32(3);
  let guard = 0;
  while (!r.state.finished) {
    assert.ok(guard++ < 800, "round terminates");
    const seat = r.state.turn;
    const moves = r.state.players[seat].hand;
    // Reuse the engine's own move generation to pick something legal.
    const legal = legalMovesFor(r.state, seat);
    const intent =
      legal.length > 0
        ? ({ kind: "play", cardIds: legal[0].cards.map((c) => c.id) } as const)
        : ({ kind: "pass" } as const);
    const result = applyIntent(r, seat, intent, T0, rng);
    assert.ok(result.ok, result.ok ? "" : result.error);
    r = result.room;
    assert.equal(moves.length >= r.state.players[seat].hand.length, true);
  }
  assert.notEqual(r.state.winner, null);
  const after = applyIntent(r, 0, { kind: "nextRound" }, T0, rng);
  assert.ok(after.ok);
  assert.equal(after.room.state.finished, false);
  assert.equal(after.room.state.roundNumber, r.state.roundNumber + 1);
});

/* ---------------------------------------------------------------------- */
/* Table display                                                           */
/* ---------------------------------------------------------------------- */

test("the table display can be claimed, is recognised by its token and expires", () => {
  const claimed = claimTableSeat(room(), "tablehash", T0);
  assert.equal(tableSeatActive(claimed, T0), true);
  assert.equal(isTableSeatToken(claimed, "tablehash"), true);
  assert.equal(isTableSeatToken(claimed, "someoneelse"), false);
  assert.equal(isTableSeatToken(claimed, null), false);
  assert.equal(tableSeatActive(claimed, T0 + TABLE_IDLE_MS + 1), false);
  assert.equal(tableSeatActive(releaseTableSeat(claimed, T0), T0), false);
});

test("the table display never receives anybody's cards", () => {
  const r = claimTableSeat(seatEveryone(room(42)), "tablehash", T0);
  const view = publicRoom(r, null, T0, true);
  assert.ok(view.seats.every((s) => s.hand === undefined));
  assert.equal(JSON.stringify(view).includes(String(r.state.seed)), false);
  assert.equal(view.isTableSeat, true);
  assert.equal(view.tableSeatActive, true);
  // Counts are still public, which is what the display is for.
  assert.deepEqual(
    view.seats.map((s) => s.cards),
    [13, 13, 13, 13],
  );
});

test("a seated player is still served their own hand while a table is active", () => {
  const r = claimTableSeat(seatEveryone(room(42)), "tablehash", T0);
  const view = publicRoom(r, 2, T0);
  assert.equal(view.seats[2].hand?.length, 13);
  assert.equal(view.tableSeatActive, true);
  assert.equal(view.isTableSeat, false);
});

test("the table display can reset the match and adjust a score", () => {
  let r = claimTableSeat(seatEveryone(room(42)), "tablehash", T0);
  const adjusted = applyTableIntent(r, { kind: "adjustScore", seat: 1, delta: -5 }, T0);
  assert.ok(adjusted.ok);
  assert.equal(adjusted.room.state.scores[1], -5);
  assert.equal(adjusted.room.version, r.version + 1);

  r = adjusted.room;
  const reset = applyTableIntent(r, { kind: "resetMatch" }, T0);
  assert.ok(reset.ok);
  assert.deepEqual(reset.room.state.scores, [0, 0, 0, 0]);
  assert.equal(reset.room.state.finished, false);
  for (const p of reset.room.state.players) assert.equal(p.hand.length, 13);
  // Seating survives a reset.
  assert.deepEqual(
    reset.room.state.players.map((p) => p.name),
    ["P0", "P1", "P2", "P3"],
  );
});

test("score adjustments are bounded and seat-checked", () => {
  const r = claimTableSeat(seatEveryone(room()), "tablehash", T0);
  for (const bad of [
    { seat: 9, delta: 1 },
    { seat: -1, delta: 1 },
    { seat: 0, delta: 10_000 },
    { seat: 0, delta: 1.5 },
    { seat: 0, delta: Number.NaN },
  ]) {
    const result = applyTableIntent(r, { kind: "adjustScore", ...bad }, T0);
    assert.equal(result.ok, false, JSON.stringify(bad));
  }
});

test("the table display cannot skip an unfinished round", () => {
  const r = claimTableSeat(seatEveryone(room(42)), "tablehash", T0);
  const early = applyTableIntent(r, { kind: "nextRound" }, T0);
  assert.equal(early.ok, false);
});

test("plays accumulate in the history and clear with the table", () => {
  let r = seatEveryone(room(42));
  assert.deepEqual(r.state.history, []);
  const seat = r.state.turn;
  const opening = legalMovesFor(r.state, seat)[0];
  const played = applyIntent(r, seat, { kind: "play", cardIds: opening.cards.map((c) => c.id) }, T0);
  assert.ok(played.ok);
  r = played.room;
  assert.equal(r.state.history.length, 1);
  assert.equal(r.state.history[0].player, seat);

  // Three passes sweep the trick, and the display should stop showing it.
  for (let i = 0; i < 3; i++) {
    const result = applyIntent(r, r.state.turn, { kind: "pass" }, T0);
    assert.ok(result.ok);
    r = result.room;
  }
  assert.equal(r.state.table, null);
  assert.deepEqual(r.state.history, []);
});
