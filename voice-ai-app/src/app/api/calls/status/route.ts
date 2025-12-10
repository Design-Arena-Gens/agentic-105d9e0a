import { NextRequest, NextResponse } from "next/server";
import { findCallBySid, initSchema, updateCallLog } from "@/lib/db";

export const dynamic = "force-dynamic";

const statusMap: Record<string, string> = {
  initiated: "initiated",
  ringing: "ringing",
  inprogress: "in-progress",
  answered: "answered",
  completed: "completed",
  busy: "busy",
  failed: "failed",
  noanswer: "no-answer",
  canceled: "canceled",
};

export async function POST(req: NextRequest) {
  try {
    await initSchema();
    const form = await req.formData();
    const callSid = form.get("CallSid")?.toString();
    const callStatus = form.get("CallStatus")?.toString();
    const callDuration = form.get("CallDuration")?.toString();
    const recordingUrl = form.get("RecordingUrl")?.toString();

    if (!callSid) {
      throw new Error("CallSid is required");
    }

    const call = await findCallBySid(callSid);
    if (!call) {
      return NextResponse.json({ ok: true });
    }

    const normalizedStatus =
      (callStatus && statusMap[callStatus.toLowerCase()]) ?? callStatus;

    const updates: Record<string, unknown> = {};
    if (normalizedStatus) {
      updates.status = normalizedStatus;
    }
    if (callDuration) {
      updates.duration_seconds = Number.parseInt(callDuration, 10) || 0;
    }
    if (recordingUrl) {
      updates.recording_url = `${recordingUrl}.mp3`;
    }

    if (Object.keys(updates).length > 0) {
      await updateCallLog(call.id, updates);
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Call status update failed.",
      { status: 400 }
    );
  }
}
