import { NextResponse, type NextRequest } from "next/server";
import { claimTableSeat, publicRoom, releaseTableSeat } from "@/lib/room";
import { hashPassword, randomToken, safeEqual, sha256Hex } from "@/lib/server/crypto";
import { getRoomStore } from "@/lib/server/store";
import {
  clearTableCookie,
  isTableSeatRequest,
  jsonError,
  loadRoomOr404,
  saveOutcome,
  setTableCookie,
} from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** Claim the shared table display. Same password as a seat, different role. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected a JSON body.", 400);
  }

  const room = await loadRoomOr404(id);
  if (!room) return jsonError("Room not found.", 404);

  const password = typeof body.password === "string" ? body.password : "";
  if (!safeEqual(await hashPassword(password, room.salt), room.passwordHash)) {
    return jsonError("Wrong password.", 403);
  }

  const token = randomToken();
  const claimed = claimTableSeat(room, await sha256Hex(token));
  const failure = saveOutcome(await getRoomStore().save(claimed, room.version));
  if (failure) return failure;

  const response = NextResponse.json(publicRoom(claimed, null, Date.now(), true));
  setTableCookie(response, room.id, token);
  return response;
}

/** Hand the table back; players return to the full layout on their phones. */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const room = await loadRoomOr404(id);
  if (!room) return jsonError("Room not found.", 404);
  if (!(await isTableSeatRequest(request, room))) {
    return jsonError("This device is not the table.", 403);
  }

  const released = releaseTableSeat(room);
  const failure = saveOutcome(await getRoomStore().save(released, room.version));
  if (failure) return failure;

  const response = NextResponse.json(publicRoom(released, null));
  clearTableCookie(response, room.id);
  return response;
}
