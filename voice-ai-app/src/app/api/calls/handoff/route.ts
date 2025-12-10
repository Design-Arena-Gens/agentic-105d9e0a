import { NextRequest, NextResponse } from "next/server";
import { findCallBySid, initSchema, updateCallLog } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await initSchema();
    const form = await req.formData();
    const callSid = form.get("CallSid")?.toString();
    const speechResult = form.get("SpeechResult")?.toString();
    const confidence = form.get("Confidence")?.toString();

    if (!callSid) {
      throw new Error("CallSid is required.");
    }

    const call = await findCallBySid(callSid);
    if (!call) {
      return new NextResponse("OK", { status: 200 });
    }

    if (speechResult) {
      await updateCallLog(call.id, {
        transcript: speechResult,
        status: "in-progress",
        sentiment_score:
          typeof confidence === "string" ? Number.parseFloat(confidence) : null,
      });
    }

    const workflowSid = process.env.TWILIO_WORKFLOW_SID;
    const response = workflowSid
      ? `
      <Response>
        <Say voice="Polly.Joanna" language="en-US">
          Thanks! Routing you to a specialist now.
        </Say>
        <Pause length="1"/>
        <Enqueue workflowSid="${workflowSid}"/>
      </Response>`.trim()
      : `
      <Response>
        <Say voice="Polly.Joanna" language="en-US">
          Thanks! Someone will follow up with you shortly.
        </Say>
        <Hangup/>
      </Response>`.trim();

    return new NextResponse(response, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Handoff failed.",
      { status: 400 }
    );
  }
}
