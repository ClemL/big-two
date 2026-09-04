import { TableSeatGate } from "@/components/TableSeatGate";

export const dynamic = "force-dynamic";

export default async function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TableSeatGate roomId={id.toUpperCase()} />;
}
