import { NextResponse } from "next/server";
import { roomVersion } from "@/lib/room";
import { jsonError, loadRoomOr404 } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * The endpoint clients poll. Deliberately tiny — the full state is fetched
 * only once the version has actually moved.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const room = await loadRoomOr404(id);
  if (!room) return jsonError("Room not found.", 404);
  return NextResponse.json(roomVersion(room));
}
