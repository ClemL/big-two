import { claimTableEndpoint, releaseTableEndpoint } from "@/lib/server/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  return claimTableEndpoint(request, (await params).id);
}

export async function DELETE(request: Request, { params }: Params) {
  return releaseTableEndpoint(request, (await params).id);
}
