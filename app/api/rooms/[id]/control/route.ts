import { NextResponse, type NextRequest } from "next/server";
import { applyTableIntent, publicRoom, type TableIntent } from "@/lib/room";
import { getRoomStore } from "@/lib/server/store";
import { isTableSeatRequest, jsonError, loadRoomOr404, saveOutcome } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

function parseIntent(body: { action?: unknown; seat?: unknown; delta?: unknown }): TableIntent | null {
  if (body.action === "nextRound") return { kind: "nextRound" };
  if (body.action === "resetMatch") return { kind: "resetMatch" };
  if (body.action === "adjustScore") {
    if (typeof body.seat !== "number" || typeof body.delta !== "number") return null;
    return { kind: "adjustScore", seat: body.seat, delta: body.delta };
  }
  return null;
}

/** Match control: only the tablet holding the table token may call this. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: { action?: unknown; seat?: unknown; delta?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected a JSON body.", 400);
  }

  const room = await loadRoomOr404(id);
  if (!room) return jsonError("Room not found.", 404);
  if (!(await isTableSeatRequest(request, room))) {
    return jsonError("Only the table can do that.", 403);
  }

  const intent = parseIntent(body);
  if (!intent) return jsonError("Unrecognized action.", 400);

  const result = applyTableIntent(room, intent);
  if (!result.ok) return jsonError(result.error, result.status);

  const failure = saveOutcome(await getRoomStore().save(result.room, room.version));
  if (failure) return failure;

  return NextResponse.json(publicRoom(result.room, null, Date.now(), true));
}
