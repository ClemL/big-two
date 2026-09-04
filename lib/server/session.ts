/**
 * Request-side helpers shared by the room routes.
 *
 * A seat is identified by a per-seat token, not by the room password. The
 * password only gets you into the room; without the token split, anyone who
 * knows the password could submit moves as any seat.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Room } from "../room.ts";
import { seatForToken } from "../room.ts";
import { sha256Hex } from "./crypto.ts";
import { getRoomStore, type SaveResult } from "./store.ts";

export const seatCookieName = (roomId: string) => `bigtwo_seat_${roomId}`;

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export function readSeatToken(request: NextRequest, roomId: string): string | null {
  return request.cookies.get(seatCookieName(roomId))?.value ?? null;
}

export function setSeatCookie(response: NextResponse, roomId: string, token: string): void {
  response.cookies.set({
    name: seatCookieName(roomId),
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export function clearSeatCookie(response: NextResponse, roomId: string): void {
  response.cookies.set({ name: seatCookieName(roomId), value: "", path: "/", maxAge: 0 });
}

/** Resolve which seat this request owns, if any. */
export async function resolveSeat(request: NextRequest, room: Room): Promise<number | null> {
  const token = readSeatToken(request, room.id);
  if (!token) return null;
  return seatForToken(room, await sha256Hex(token));
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export async function loadRoomOr404(id: string) {
  const store = getRoomStore();
  const room = await store.load(id.toUpperCase());
  return room;
}

export function saveOutcome(result: SaveResult): NextResponse | null {
  if (result === "ok") return null;
  if (result === "conflict") {
    return jsonError("Someone else moved first — reload and try again.", 409);
  }
  return jsonError("Room not found.", 404);
}
