import { createRoomEndpoint } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createRoomEndpoint;
