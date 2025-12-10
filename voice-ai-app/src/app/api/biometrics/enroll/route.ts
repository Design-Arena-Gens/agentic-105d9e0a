import { NextRequest, NextResponse } from "next/server";
import { biometricEnrollSchema } from "@/lib/validators";
import {
  getContactById,
  initSchema,
  storeBiometricProfile,
} from "@/lib/db";
import { extractVoiceSignatureFromBase64 } from "@/lib/biometrics";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await initSchema();
    const payload = biometricEnrollSchema.parse(await req.json());
    const contact = await getContactById(payload.contactId);
    if (!contact) {
      throw new Error("Contact not found.");
    }

    const signature = await extractVoiceSignatureFromBase64(
      payload.audioBase64
    );
    const profile = await storeBiometricProfile({
      contactId: contact.id,
      voiceSignature: signature.vector,
      sampleRate: signature.sampleRate,
      label: payload.label ?? contact.name,
    });

    return NextResponse.json({ data: profile });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Voice enrollment failed.",
      },
      { status: 400 }
    );
  }
}
