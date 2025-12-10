import { NextRequest, NextResponse } from "next/server";
import { whatsappMessageSchema } from "@/lib/validators";
import {
  getContactById,
  initSchema,
  upsertContact,
} from "@/lib/db";
import { getTwilioClient, getTwilioWhatsappFrom } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await initSchema();
    const payload = whatsappMessageSchema.parse(await req.json());
    const client = getTwilioClient();
    const from = getTwilioWhatsappFrom();

    let phone = payload.phone;
    if (payload.contactId) {
      const contact = await getContactById(payload.contactId);
      if (!contact?.whatsapp && !phone) {
        throw new Error(
          "WhatsApp number not found. Please provide a destination."
        );
      }
      phone = contact?.whatsapp ?? contact?.phone ?? phone;
    }

    if (!phone) {
      throw new Error("Destination phone number is required.");
    }

    await client.messages.create({
      from,
      to: phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`,
      body: payload.message,
    });

    if (payload.contactId) {
      await upsertContact({
        name: `Contact ${payload.contactId}`,
        phone,
        whatsapp: phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send WhatsApp message.",
      },
      { status: 400 }
    );
  }
}
