import { NextRequest, NextResponse } from "next/server";
import { contactSchema } from "@/lib/validators";
import { initSchema, listContacts, upsertContact } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await initSchema();
  const contacts = await listContacts();
  return NextResponse.json({ data: contacts });
}

export async function POST(req: NextRequest) {
  try {
    await initSchema();
    const payload = await req.json();
    const parsed = contactSchema.parse(payload);
    const contact = await upsertContact(parsed);
    return NextResponse.json({ data: contact });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upsert contact.",
      },
      { status: 400 }
    );
  }
}
