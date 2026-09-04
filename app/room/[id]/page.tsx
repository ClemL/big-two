import { RoomLobby } from "@/components/RoomLobby";

export const dynamic = "force-dynamic";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RoomLobby roomId={id.toUpperCase()} />;
}
