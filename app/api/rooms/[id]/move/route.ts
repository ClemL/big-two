import { NextResponse, type NextRequest } from "next/server";
import { applyIntent, publicRoom, type Intent } from "@/lib/room";
import { getRoomStore } from "@/lib/server/store";
import { jsonError, loadRoomOr404, resolveSeat, saveOutcome } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
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

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: { action?: unknown; cardIds?: unknown; version?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected a JSON body.", 400);
  }

  const room = await loadRoomOr404(id);
  if (!room) return jsonError("Room not found.", 404);

  const seat = await resolveSeat(request, room);
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

  return NextResponse.json(publicRoom(result.room, seat));
}
