import { NextRequest, NextResponse } from "next/server";
import {
  findCallBySid,
  initSchema,
  updateCallLog,
} from "@/lib/db";
import { transcribeAudioFromUrl } from "@/lib/assemblyai";
import { analyzeSentiment, summarizeTranscript } from "@/lib/openai";
import { transcriptionJobSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

async function parsePayload(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return transcriptionJobSchema.parse(await req.json());
  }
  const form = await req.formData();
  const recordingUrl = form.get("RecordingUrl")?.toString();
  const callSid = form.get("CallSid")?.toString();
  if (!recordingUrl || !callSid) {
    throw new Error("RecordingUrl and CallSid are required.");
  }

  const call = await findCallBySid(callSid);
  if (!call) {
    throw new Error("Call log not found for CallSid.");
  }

  return {
    callId: call.id,
    recordingUrl,
  };
}

export async function POST(req: NextRequest) {
  try {
    await initSchema();
    const payload = await parsePayload(req);

    const transcriptResponse = await transcribeAudioFromUrl(
      payload.recordingUrl
    );
    const transcriptText = transcriptResponse.text ?? "";
    const summary = await summarizeTranscript(transcriptText);
    const sentiment = await analyzeSentiment(transcriptText);

    const updated = await updateCallLog(payload.callId, {
      transcript: transcriptText,
      summary,
      sentiment: sentiment.sentiment,
      sentiment_score: sentiment.score,
      highlights: sentiment.highlights,
      status: "processed",
    });

    return NextResponse.json({
      data: updated,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Transcription job failed.",
      },
      { status: 400 }
    );
  }
}
