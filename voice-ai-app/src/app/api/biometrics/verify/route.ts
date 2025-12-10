import { NextRequest, NextResponse } from "next/server";
import { biometricVerifySchema } from "@/lib/validators";
import {
  getBiometricProfile,
  getContactById,
  initSchema,
} from "@/lib/db";
import {
  compareVoiceSignatures,
  extractVoiceSignatureFromBase64,
} from "@/lib/biometrics";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await initSchema();
    const payload = biometricVerifySchema.parse(await req.json());
    const [contact, profile] = await Promise.all([
      getContactById(payload.contactId),
      getBiometricProfile(payload.contactId),
    ]);

    if (!contact || !profile) {
      throw new Error("Enrolled biometric profile not found for contact.");
    }

    const signature = await extractVoiceSignatureFromBase64(
      payload.audioBase64
    );

    const { similarity, distance } = compareVoiceSignatures(
      {
        vector: signature.vector,
        sampleRate: signature.sampleRate,
      },
      {
        vector: profile.voice_signature as number[],
        sampleRate: profile.sample_rate as number,
      }
    );
    const threshold = payload.threshold ?? 0.78;
    const isMatch = similarity >= threshold;

    return NextResponse.json({
      data: {
        match: isMatch,
        similarity,
        distance,
        threshold,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Voice verification failed.",
      },
      { status: 400 }
    );
  }
}
