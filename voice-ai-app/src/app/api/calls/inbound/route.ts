import { NextRequest, NextResponse } from "next/server";
import { twiml } from "twilio";
import { config } from "@/lib/config";
import { createCallLog, initSchema, upsertContact } from "@/lib/db";

export const dynamic = "force-dynamic";

async function handleInbound(req: NextRequest) {
  await initSchema();
  const form = await req.formData();
  const from = form.get("From")?.toString();
  const callSid = form.get("CallSid")?.toString();
  const callerName =
    form.get("CallerName")?.toString() ??
    form.get("CallerCity")?.toString() ??
    "Caller";

  if (!from || !callSid) {
    throw new Error("Invalid inbound call payload from Twilio.");
  }

  const contact = await upsertContact({
    name: callerName,
    phone: from,
  });

  await createCallLog({
    contactId: contact.id,
    direction: "inbound",
    status: "answered",
    callSid,
  });

  const response = new twiml.VoiceResponse();
  const baseUrl = process.env.VOICE_AI_BASE_URL ?? "";
  const gatherOptions: Record<string, unknown> = {
    input: "speech",
    method: "POST",
    speechTimeout: "auto",
  };
  if (baseUrl) {
    gatherOptions.action = `${baseUrl}/api/calls/handoff`;
  }

  response.say(
    {
      voice: "Polly.Joanna",
      language: "en-US",
    },
    `Hi ${callerName}, you have reached ${config.agentName}. I will analyze your request and route it to the right person.`
  );

  const gather = response.gather(gatherOptions);
  gather.say(
    {
      voice: "Polly.Joanna",
      language: "en-US",
    },
    "Please describe how we can help you today."
  );
  response.pause({ length: 1 });
  response.say(
    {
      voice: "Polly.Joanna",
      language: "en-US",
    },
    "Thank you. Someone will be with you shortly."
  );
  response.hangup();

  return new NextResponse(response.toString(), {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    return await handleInbound(req);
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Inbound call failure",
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    return await handleInbound(req);
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Inbound call failure",
      { status: 400 }
    );
  }
}
