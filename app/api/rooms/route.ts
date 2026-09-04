import { NextResponse, type NextRequest } from "next/server";
import { createRoom } from "@/lib/room";
import { hashPassword, randomRoomId, randomToken } from "@/lib/server/crypto";
import { getRoomStore } from "@/lib/server/store";
import { jsonError } from "@/lib/server/session";
import type { AiStyle } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AI_STYLES: AiStyle[] = ["weakest", "random", "strategist"];

export async function POST(request: NextRequest) {
  let body: { password?: unknown; aiStyle?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected a JSON body.", 400);
  }

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
      return NextResponse.json({ id: room.id, storage: store.kind }, { status: 201 });
    }
  }
  return jsonError("Could not allocate a room id — try again.", 503);
}
