import { NextRequest, NextResponse } from "next/server";
import { twiml } from "twilio";
import { outboundCallSchema } from "@/lib/validators";
import {
  createCallLog,
  getContactById,
  initSchema,
  upsertContact,
} from "@/lib/db";
import { getTwilioCallerId, getTwilioClient } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await initSchema();
    const payload = await req.json();
    const parsed = outboundCallSchema.parse(payload);
    const client = getTwilioClient();
    const callerId = getTwilioCallerId();

    let phone = parsed.phone;
    let contactId = parsed.contactId;
    let contactName = "";
    const metadataName =
      parsed.metadata && typeof parsed.metadata["name"] === "string"
        ? (parsed.metadata["name"] as string)
        : undefined;

    if (contactId) {
      const contact = await getContactById(contactId);
      if (!contact) {
        throw new Error("Contact not found.");
      }
      phone = contact.phone;
      contactName = contact.name;
    }

    if (!phone) {
      throw new Error("A destination phone number is required.");
    }

    if (!contactId) {
      const contact = await upsertContact({
        name: metadataName ?? phone,
        phone,
        metadata: parsed.metadata,
      });
      contactId = contact.id;
      contactName = contact.name;
    }

    const prompt = parsed.agentPrompt;
    const baseUrl = process.env.VOICE_AI_BASE_URL ?? "";
    const response = new twiml.VoiceResponse();
    response.say(
      {
        voice: "Polly.Joanna",
        language: "en-US",
      },
      `Hello ${contactName || "there"}, this is ${
        process.env.DEFAULT_AGENT_NAME ?? "your virtual agent"
      }. ${prompt}`
    );
    response.pause({ length: 1 });
    response.say(
      {
        voice: "Polly.Joanna",
        language: "en-US",
      },
      "If you would like to speak with a human agent, please stay on the line."
    );
    const recordOptions: Record<string, unknown> = {
      playBeep: true,
      recordingStatusCallbackMethod: "POST",
    };
    if (baseUrl) {
      recordOptions.recordingStatusCallback = `${baseUrl}/api/calls/transcribe`;
    }
    response.record(recordOptions);

    const callOptions: Parameters<typeof client.calls.create>[0] = {
      to: phone,
      from: callerId,
      twiml: response.toString(),
      record: true,
      machineDetection: "Enable",
    };

    if (baseUrl) {
      callOptions.statusCallback = `${baseUrl}/api/calls/status`;
      callOptions.statusCallbackMethod = "POST";
      callOptions.statusCallbackEvent = [
        "initiated",
        "ringing",
        "answered",
        "completed",
      ];
    }

    const call = await client.calls.create(callOptions);

    const callLog = await createCallLog({
      contactId: contactId ?? null,
      direction: "outbound",
      status: "initiated",
      callSid: call.sid,
    });

    return NextResponse.json({
      data: {
        callSid: call.sid,
        callLogId: callLog.id,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Call failed." },
      { status: 400 }
    );
  }
}
