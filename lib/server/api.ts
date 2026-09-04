/**
 * Every room endpoint, as plain `Request` -> `Response` functions.
 *
 * `app/api/**` only adapts Next's route signature onto these, so the rules that
 * matter — who may act, what is refused, what is redacted — are all here and
 * all reachable from a test without a running server.
 */

import type { AiStyle } from "../ai.ts";
import {
  applyIntent,
  applyTableIntent,
  claimSeat,
  claimTableSeat,
  createRoom,
  isTableSeatToken,
  publicRoom,
  releaseSeat,
  releaseTableSeat,
  roomVersion,
  seatForToken,
  touchSeat,
  touchTableSeat,
  type Intent,
  type Room,
  type TableIntent,
} from "../room.ts";
import { hashPassword, randomRoomId, randomToken, safeEqual, sha256Hex } from "./crypto.ts";
import { clearCookie, clientKey, json, jsonError, readCookie, readJson, setCookie } from "./http.ts";
import {
  PASSWORD_PER_CALLER,
  PASSWORD_PER_ROOM,
  ROOM_CREATION,
  enforce,
} from "./rateLimit.ts";
import { getRoomStore, type SaveResult } from "./store.ts";

const AI_STYLES: AiStyle[] = ["weakest", "random", "strategist"];

/**
 * How stale presence has to get before the version poll rewrites it.
 *
 * Presence used to be refreshed only when the full state was fetched, which
 * happens only when the version moves — so a quiet table aged everyone out and
 * the AI took over seats whose owners were watching. Refreshing on the poll
 * fixes that, and the threshold keeps it to roughly one write a minute per
 * client rather than one per poll.
 */
const PRESENCE_REFRESH_MS = 60_000;

export const seatCookieName = (roomId: string) => `bigtwo_seat_${roomId}`;
export const tableCookieName = (roomId: string) => `bigtwo_table_${roomId}`;

function tooMany(retryAfterSeconds: number): Response {
  return jsonError("Too many attempts — wait a few minutes.", 429, {
    "retry-after": String(retryAfterSeconds),
  });
}

function saveOutcome(result: SaveResult): Response | null {
  if (result === "ok") return null;
  if (result === "conflict") {
    return jsonError("Someone else moved first — reload and try again.", 409);
  }
  return jsonError("Room not found.", 404);
}

async function loadRoom(id: string): Promise<Room | null> {
  return getRoomStore().load(id.toUpperCase());
}

async function seatOf(request: Request, room: Room): Promise<number | null> {
  const token = readCookie(request, seatCookieName(room.id));
  if (!token) return null;
  return seatForToken(room, await sha256Hex(token));
}

async function isTableDevice(request: Request, room: Room): Promise<boolean> {
  const token = readCookie(request, tableCookieName(room.id));
  if (!token) return false;
  return isTableSeatToken(room, await sha256Hex(token));
}

/* ---------------------------------------------------------------------- */

export async function createRoomEndpoint(request: Request): Promise<Response> {
  const limited = await enforce([{ rule: ROOM_CREATION, key: clientKey(request) }]);
  if (limited) return tooMany(limited.retryAfterSeconds);

  const body = await readJson<{ password?: unknown; aiStyle?: unknown }>(request);
  if (!body) return jsonError("Expected a JSON body.", 400);

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 3 || password.length > 128) {
    return jsonError("Choose a password between 3 and 128 characters.", 400);
  }
  const aiStyle = AI_STYLES.includes(body.aiStyle as AiStyle) ? (body.aiStyle as AiStyle) : "weakest";

  const store = getRoomStore();
  const salt = randomToken(16);
  const passwordHash = await hashPassword(password, salt);

  // Retry on the vanishingly unlikely id collision rather than overwrite a room.
  for (let attempt = 0; attempt < 5; attempt++) {
    const room = createRoom({ id: randomRoomId(), passwordHash, salt, aiStyle });
    if (await store.create(room)) {
      return json({ id: room.id, storage: store.kind }, 201);
    }
  }
  return jsonError("Could not allocate a room id — try again.", 503);
}

export async function joinEndpoint(request: Request, roomId: string): Promise<Response> {
  const body = await readJson<{ seat?: unknown; password?: unknown; name?: unknown }>(request);
  if (!body) return jsonError("Expected a JSON body.", 400);

  const room = await loadRoom(roomId);
  if (!room) return jsonError("Room not found.", 404);

  const limited = await enforce([
    { rule: PASSWORD_PER_CALLER, key: `${room.id}:${clientKey(request)}` },
    { rule: PASSWORD_PER_ROOM, key: room.id },
  ]);
  if (limited) return tooMany(limited.retryAfterSeconds);

  const password = typeof body.password === "string" ? body.password : "";
  if (!safeEqual(await hashPassword(password, room.salt), room.passwordHash)) {
    return jsonError("Wrong password.", 403);
  }

  const seat = typeof body.seat === "number" ? body.seat : Number.NaN;
  const name = typeof body.name === "string" ? body.name : "";
  const token = randomToken();
  const result = claimSeat(room, seat, await sha256Hex(token), name);
  if (!result.ok) return jsonError(result.error, result.status);

  const failure = saveOutcome(await getRoomStore().save(result.room, room.version));
  if (failure) return failure;

  return setCookie(json(publicRoom(result.room, seat)), seatCookieName(room.id), token);
}

export async function leaveSeatEndpoint(request: Request, roomId: string): Promise<Response> {
  const room = await loadRoom(roomId);
  if (!room) return jsonError("Room not found.", 404);

  const seat = await seatOf(request, room);
  if (seat === null) return jsonError("You are not seated in this room.", 403);

  const freed = releaseSeat(room, seat);
  const failure = saveOutcome(await getRoomStore().save(freed, room.version));
  if (failure) return failure;

  return clearCookie(json(publicRoom(freed, null)), seatCookieName(room.id));
}

export async function stateEndpoint(request: Request, roomId: string): Promise<Response> {
  const room = await loadRoom(roomId);
  if (!room) return jsonError("Room not found.", 404);

  if (await isTableDevice(request, room)) {
    const touched = touchTableSeat(room);
    await getRoomStore().save(touched, room.version);
    return json(publicRoom(touched, null, Date.now(), true));
  }

  const seat = await seatOf(request, room);
  if (seat !== null) {
    // Presence keeps the AI from taking over a seat that is still watching. It
    // does not change the version, so it never wakes the other clients.
    const touched = touchSeat(room, seat);
    await getRoomStore().save(touched, room.version);
    return json(publicRoom(touched, seat));
  }
  return json(publicRoom(room, null));
}

export async function versionEndpoint(request: Request, roomId: string): Promise<Response> {
  const room = await loadRoom(roomId);
  if (!room) return jsonError("Room not found.", 404);

  const now = Date.now();
  if (await isTableDevice(request, room)) {
    if (now - (room.tableSeat?.lastSeen ?? 0) > PRESENCE_REFRESH_MS) {
      // Presence never changes the version, so this does not wake anyone.
      await getRoomStore().save(touchTableSeat(room, now), room.version);
    }
  } else {
    const seat = await seatOf(request, room);
    if (seat !== null && now - room.seats[seat].lastSeen > PRESENCE_REFRESH_MS) {
      await getRoomStore().save(touchSeat(room, seat, now), room.version);
    }
  }
  return json(roomVersion(room, now));
}

function parseIntent(body: { action?: unknown; cardIds?: unknown }): Intent | null {
  if (body.action === "pass") return { kind: "pass" };
  if (body.action === "nextRound") return { kind: "nextRound" };
  if (body.action === "play") {
    const ids = body.cardIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 5) return null;
    if (!ids.every((id) => typeof id === "string" && id.length <= 3)) return null;
    return { kind: "play", cardIds: ids as string[] };
  }
  return null;
}

export async function moveEndpoint(request: Request, roomId: string): Promise<Response> {
  const body = await readJson<{ action?: unknown; cardIds?: unknown; version?: unknown }>(request);
  if (!body) return jsonError("Expected a JSON body.", 400);

  const room = await loadRoom(roomId);
  if (!room) return jsonError("Room not found.", 404);

  const seat = await seatOf(request, room);
  if (seat === null) return jsonError("Take a seat before playing.", 403);

  // The client tells us what it was looking at. If the room moved on since,
  // reject rather than apply a move decided against stale information.
  if (typeof body.version === "number" && body.version !== room.version) {
    return jsonError("The table moved on — reloading.", 409);
  }

  const intent = parseIntent(body);
  if (!intent) return jsonError("Unrecognized action.", 400);

  const result = applyIntent(room, seat, intent);
  if (!result.ok) return jsonError(result.error, result.status);

  const failure = saveOutcome(await getRoomStore().save(result.room, room.version));
  if (failure) return failure;

  return json(publicRoom(result.room, seat));
}

export async function claimTableEndpoint(request: Request, roomId: string): Promise<Response> {
  const body = await readJson<{ password?: unknown }>(request);
  if (!body) return jsonError("Expected a JSON body.", 400);

  const room = await loadRoom(roomId);
  if (!room) return jsonError("Room not found.", 404);

  const limited = await enforce([
    { rule: PASSWORD_PER_CALLER, key: `${room.id}:${clientKey(request)}` },
    { rule: PASSWORD_PER_ROOM, key: room.id },
  ]);
  if (limited) return tooMany(limited.retryAfterSeconds);

  const password = typeof body.password === "string" ? body.password : "";
  if (!safeEqual(await hashPassword(password, room.salt), room.passwordHash)) {
    return jsonError("Wrong password.", 403);
  }

  const token = randomToken();
  const claimed = claimTableSeat(room, await sha256Hex(token));
  const failure = saveOutcome(await getRoomStore().save(claimed, room.version));
  if (failure) return failure;

  return setCookie(
    json(publicRoom(claimed, null, Date.now(), true)),
    tableCookieName(room.id),
    token,
  );
}

export async function releaseTableEndpoint(request: Request, roomId: string): Promise<Response> {
  const room = await loadRoom(roomId);
  if (!room) return jsonError("Room not found.", 404);
  if (!(await isTableDevice(request, room))) {
    return jsonError("This device is not the table.", 403);
  }

  const released = releaseTableSeat(room);
  const failure = saveOutcome(await getRoomStore().save(released, room.version));
  if (failure) return failure;

  return clearCookie(json(publicRoom(released, null)), tableCookieName(room.id));
}

function parseTableIntent(body: {
  action?: unknown;
  seat?: unknown;
  delta?: unknown;
}): TableIntent | null {
  if (body.action === "nextRound") return { kind: "nextRound" };
  if (body.action === "resetMatch") return { kind: "resetMatch" };
  if (body.action === "adjustScore") {
    if (typeof body.seat !== "number" || typeof body.delta !== "number") return null;
    return { kind: "adjustScore", seat: body.seat, delta: body.delta };
  }
  return null;
}

export async function controlEndpoint(request: Request, roomId: string): Promise<Response> {
  const body = await readJson<{ action?: unknown; seat?: unknown; delta?: unknown }>(request);
  if (!body) return jsonError("Expected a JSON body.", 400);

  const room = await loadRoom(roomId);
  if (!room) return jsonError("Room not found.", 404);
  if (!(await isTableDevice(request, room))) {
    return jsonError("Only the table can do that.", 403);
  }

  const intent = parseTableIntent(body);
  if (!intent) return jsonError("Unrecognized action.", 400);

  const result = applyTableIntent(room, intent);
  if (!result.ok) return jsonError(result.error, result.status);

  const failure = saveOutcome(await getRoomStore().save(result.room, room.version));
  if (failure) return failure;

  return json(publicRoom(result.room, null, Date.now(), true));
}
