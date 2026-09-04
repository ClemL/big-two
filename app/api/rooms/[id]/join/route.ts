import { NextResponse, type NextRequest } from "next/server";
import { claimSeat, publicRoom, releaseSeat, seatForToken } from "@/lib/room";
import { hashPassword, randomToken, safeEqual, sha256Hex } from "@/lib/server/crypto";
import { getRoomStore } from "@/lib/server/store";
import {
  clearSeatCookie,
  jsonError,
  loadRoomOr404,
  readSeatToken,
  saveOutcome,
  setSeatCookie,
} from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** Take a seat: password gets you into the room, the token identifies the seat. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: { seat?: unknown; password?: unknown; name?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected a JSON body.", 400);
  }

  const room = await loadRoomOr404(id);
  if (!room) return jsonError("Room not found.", 404);

  const password = typeof body.password === "string" ? body.password : "";
  const attempted = await hashPassword(password, room.salt);
  if (!safeEqual(attempted, room.passwordHash)) {
    return jsonError("Wrong password.", 403);
  }

  const seat = typeof body.seat === "number" ? body.seat : Number.NaN;
  const name = typeof body.name === "string" ? body.name : "";
  const token = randomToken();
  const result = claimSeat(room, seat, await sha256Hex(token), name);
  if (!result.ok) return jsonError(result.error, result.status);

  const store = getRoomStore();
  const failure = saveOutcome(await store.save(result.room, room.version));
  if (failure) return failure;

  const response = NextResponse.json(publicRoom(result.room, seat));
  setSeatCookie(response, room.id, token);
  return response;
}

/** Give the seat back; the AI picks it up from the next turn. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const room = await loadRoomOr404(id);
  if (!room) return jsonError("Room not found.", 404);

  const token = readSeatToken(request, room.id);
  const seat = token ? seatForToken(room, await sha256Hex(token)) : null;
  if (seat === null) return jsonError("You are not seated in this room.", 403);

  const store = getRoomStore();
  const freed = releaseSeat(room, seat);
  const failure = saveOutcome(await store.save(freed, room.version));
  if (failure) return failure;

  const response = NextResponse.json(publicRoom(freed, null));
  clearSeatCookie(response, room.id);
  return response;
}
