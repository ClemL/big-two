import { ScanJoin } from "@/components/ScanJoin";

export const dynamic = "force-dynamic";

export default async function ScanJoinPage({
  params,
}: {
  params: Promise<{ id: string; code: string }>;
}) {
  const { id, code } = await params;
  return <ScanJoin roomId={id.toUpperCase()} code={code} />;
}
