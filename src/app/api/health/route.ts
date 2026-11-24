import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "cattle-capture",
    mode: "dataset-capture",
    timestamp: new Date().toISOString(),
  });
}
