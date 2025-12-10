import { NextResponse } from "next/server";
import { initSchema, listCallLogs } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await initSchema();
  const calls = await listCallLogs();
  return NextResponse.json({ data: calls });
}
