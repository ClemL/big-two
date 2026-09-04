import { NextResponse, type NextRequest } from "next/server";
import { publicRoom, touchSeat } from "@/lib/room";
import { getRoomStore } from "@/lib/server/store";
import { jsonError, loadRoomOr404, resolveSeat } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** The room as this caller may see it: own hand only, never the deal seed. */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const room = await loadRoomOr404(id);
  if (!room) return jsonError("Room not found.", 404);

  const seat = await resolveSeat(request, room);
  if (seat !== null) {
    // Presence keeps the AI from taking over a seat that is still watching.
    // It does not change the version, so it never wakes the other clients.
    const touched = touchSeat(room, seat);
    await getRoomStore().save(touched, room.version);
    return NextResponse.json(publicRoom(touched, seat));
  }
  return NextResponse.json(publicRoom(room, null));
}
