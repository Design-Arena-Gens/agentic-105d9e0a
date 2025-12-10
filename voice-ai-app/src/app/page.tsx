/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";

type Contact = {
  id: number;
  name: string;
  phone: string;
  whatsapp: string | null;
  metadata?: Record<string, unknown>;
};

type CallLog = {
  id: number;
  contact_id: number | null;
  direction: "inbound" | "outbound";
  status: string;
  transcript: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  summary: string | null;
  highlights: string[] | null;
  call_sid: string | null;
  recording_url: string | null;
  started_at: string;
  duration_seconds: number;
};

type Flash = {
  id: number;
  type: "success" | "error";
  message: string;
};

async function asBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [, payload] = result.split(",");
      resolve(payload);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function badgeClassName(status: string) {
  const base =
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset";
  switch (status.toLowerCase()) {
    case "completed":
    case "processed":
      return `${base} bg-emerald-50 text-emerald-700 ring-emerald-600/20`;
    case "in-progress":
    case "answered":
      return `${base} bg-blue-50 text-blue-700 ring-blue-600/20`;
    case "failed":
    case "canceled":
      return `${base} bg-rose-50 text-rose-600 ring-rose-500/20`;
    default:
      return `${base} bg-slate-100 text-slate-700 ring-slate-500/10`;
  }
}

export default function Home() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<number | "new">(
    "new"
  );
  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    whatsapp: "",
  });
  const [agentPrompt, setAgentPrompt] = useState(
    "I am calling to follow up on your recent inquiry. How can I assist you today?"
  );
  const [whatsappMessage, setWhatsappMessage] = useState(
    "Hello! This is our AI agent checking in. Let us know if you need anything."
  );
  const [biometricFile, setBiometricFile] = useState<File | null>(null);
  const [verificationFile, setVerificationFile] = useState<File | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isMessaging, setIsMessaging] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [contactsRes, callsRes] = await Promise.all([
          fetch("/api/contacts").then((res) => res.json()),
          fetch("/api/calls").then((res) => res.json()),
        ]);
        setContacts(contactsRes.data ?? []);
        setCalls(callsRes.data ?? []);
      } catch (error) {
        console.error(error);
        pushFlash("error", "Failed to load initial data.");
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  const selectedContact = useMemo(() => {
    if (selectedContactId === "new") return undefined;
    return contacts.find((contact) => contact.id === selectedContactId);
  }, [selectedContactId, contacts]);

  function pushFlash(type: Flash["type"], message: string) {
    setFlashes((previous) => [
      ...previous,
      { id: Date.now(), type, message },
    ]);
    setTimeout(() => {
      setFlashes((prev) => prev.slice(1));
    }, 4000);
  }

  async function refreshCalls() {
    const callsRes = await fetch("/api/calls").then((res) => res.json());
    setCalls(callsRes.data ?? []);
  }

  async function refreshContacts() {
    const contactsRes = await fetch("/api/contacts").then((res) => res.json());
    setContacts(contactsRes.data ?? []);
  }

  async function handleOutboundCall(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsCalling(true);
      let contactId: number | undefined;
      let phone: string | undefined;

      if (selectedContactId === "new") {
        if (!newContact.name || !newContact.phone) {
          pushFlash("error", "Enter name and phone number for the new contact.");
          return;
        }
        const res = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newContact.name,
            phone: newContact.phone,
            whatsapp: newContact.whatsapp || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to create contact");
        }
        await refreshContacts();
        contactId = data.data.id;
      } else {
        contactId = selectedContactId;
        phone = selectedContact?.phone;
      }

      const response = await fetch("/api/calls/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          phone,
          agentPrompt,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Call initiation failed");
      }
      pushFlash(
        "success",
        `Outbound call queued successfully (SID: ${result.data.callSid}).`
      );
      await refreshCalls();
    } catch (error) {
      console.error(error);
      pushFlash(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to initiate outbound call."
      );
    } finally {
      setIsCalling(false);
    }
  }

  async function handleSendWhatsapp(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    try {
      setIsMessaging(true);
      const destination =
        selectedContact?.whatsapp ?? selectedContact?.phone ?? newContact.phone;
      const response = await fetch("/api/messaging/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId:
            selectedContactId === "new" ? undefined : selectedContactId,
          phone: destination,
          message: whatsappMessage,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to send WhatsApp message.");
      }
      pushFlash("success", "WhatsApp message sent successfully.");
    } catch (error) {
      console.error(error);
      pushFlash(
        "error",
        error instanceof Error
          ? error.message
          : "WhatsApp message failed to send."
      );
    } finally {
      setIsMessaging(false);
    }
  }

  async function handleBiometricEnroll(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    try {
      setIsEnrolling(true);
      if (!biometricFile) {
        throw new Error("Please upload an audio sample for enrollment.");
      }
      if (selectedContactId === "new") {
        throw new Error("Select an existing contact to enroll biometrics.");
      }
      const base64 = await asBase64(biometricFile);
      const response = await fetch("/api/biometrics/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: selectedContactId,
          audioBase64: base64,
          label: selectedContact?.name,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to enroll voice biometric.");
      }
      pushFlash(
        "success",
        `Voice biometric profile captured for ${selectedContact?.name ?? "contact"}.`
      );
    } catch (error) {
      console.error(error);
      pushFlash(
        "error",
        error instanceof Error ? error.message : "Voice enrollment failed."
      );
    } finally {
      setIsEnrolling(false);
    }
  }

  async function handleBiometricVerify(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    try {
      setIsVerifying(true);
      if (!verificationFile) {
        throw new Error("Upload a verification audio sample.");
      }
      if (selectedContactId === "new") {
        throw new Error("Select an enrolled contact to verify.");
      }
      const base64 = await asBase64(verificationFile);
      const response = await fetch("/api/biometrics/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: selectedContactId,
          audioBase64: base64,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Voice verification failed.");
      }
      const match = data.data.match
        ? "Voice match confirmed ✅"
        : "Voice did not match the enrolled signature ⚠️";
      pushFlash("success", match);
    } catch (error) {
      console.error(error);
      pushFlash(
        "error",
        error instanceof Error ? error.message : "Voice verification failed."
      );
    } finally {
      setIsVerifying(false);
    }
  }

  const sentimentScore = useMemo(() => {
    if (calls.length === 0) return 0;
    const validScores = calls
      .map((call) => call.sentiment_score)
      .filter((score): score is number => typeof score === "number");
    if (validScores.length === 0) return 0;
    const average =
      validScores.reduce((acc, value) => acc + value, 0) / validScores.length;
    return Number(average.toFixed(2));
  }, [calls]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_#312e8188,_#0f172a_55%)]" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-12">
        <header className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-semibold leading-tight text-white">
                Conversational Voice AI Control Center
              </h1>
              <p className="text-slate-300">
                Initiate and orchestrate autonomous voice outreach, verify
                callers biometrically, analyze sentiment, and send follow-up
                WhatsApp messages from one command console.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-right backdrop-blur-lg">
              <p className="text-sm uppercase tracking-wide text-slate-300">
                Avg Sentiment
              </p>
              <p className="text-3xl font-semibold text-emerald-300">
                {sentimentScore > 0 ? "+" : ""}
                {sentimentScore}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {flashes.map((flash) => (
              <div
                key={flash.id}
                className={`rounded-full px-4 py-2 text-sm shadow ring-1 ring-inset ${
                  flash.type === "success"
                    ? "bg-emerald-900/50 text-emerald-100 ring-emerald-400/40"
                    : "bg-rose-900/60 text-rose-100 ring-rose-400/40"
                }`}
              >
                {flash.message}
              </div>
            ))}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <form
              onSubmit={handleOutboundCall}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-emerald-500/10 backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-white">
                  Outbound Voice Campaign
                </h2>
                <span className="text-xs uppercase tracking-wide text-slate-300">
                  Real-time voice agent
                </span>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-200">
                  Select contact
                  <select
                    value={selectedContactId}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedContactId(
                        value === "new" ? "new" : Number.parseInt(value, 10)
                      );
                    }}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/80 p-3 text-sm text-white outline-none ring-emerald-400/40 focus:ring"
                  >
                    <option value="new">➕ New contact</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name} · {contact.phone}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedContactId === "new" && (
                  <label className="space-y-2 text-sm text-slate-200">
                    Contact name
                    <input
                      required
                      value={newContact.name}
                      onChange={(event) =>
                        setNewContact((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 p-3 text-sm text-white outline-none ring-emerald-400/40 focus:ring"
                      placeholder="Jamie Chen"
                    />
                  </label>
                )}
                {selectedContactId === "new" && (
                  <label className="space-y-2 text-sm text-slate-200">
                    Contact phone
                    <input
                      required
                      value={newContact.phone}
                      onChange={(event) =>
                        setNewContact((prev) => ({
                          ...prev,
                          phone: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 p-3 text-sm text-white outline-none ring-emerald-400/40 focus:ring"
                      placeholder="+15551234567"
                    />
                  </label>
                )}
                {selectedContactId === "new" && (
                  <label className="space-y-2 text-sm text-slate-200">
                    WhatsApp number
                    <input
                      value={newContact.whatsapp}
                      onChange={(event) =>
                        setNewContact((prev) => ({
                          ...prev,
                          whatsapp: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-slate-900/80 p-3 text-sm text-white outline-none ring-emerald-400/40 focus:ring"
                      placeholder="+15551234567"
                    />
                  </label>
                )}
              </div>
              <label className="mt-4 block space-y-2 text-sm text-slate-200">
                Agent objective
                <textarea
                  value={agentPrompt}
                  onChange={(event) => setAgentPrompt(event.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 p-3 text-sm text-white outline-none ring-emerald-400/40 focus:ring"
                />
              </label>
              <button
                type="submit"
                disabled={isCalling}
                className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-700/60"
              >
                {isCalling ? "Dialing…" : "Launch outbound call"}
              </button>
            </form>

            <form
              onSubmit={handleSendWhatsapp}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">
                  WhatsApp Follow-up
                </h3>
                <span className="text-xs uppercase tracking-wide text-slate-300">
                  CRM integration
                </span>
              </div>
              <label className="mt-4 block space-y-2 text-sm text-slate-200">
                Message
                <textarea
                  value={whatsappMessage}
                  onChange={(event) => setWhatsappMessage(event.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-white/10 bg-slate-900/80 p-3 text-sm text-white outline-none ring-emerald-400/40 focus:ring"
                />
              </label>
              <button
                type="submit"
                disabled={isMessaging}
                className="mt-4 inline-flex items-center rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-400/30 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-700/60"
              >
                {isMessaging ? "Sending…" : "Send WhatsApp update"}
              </button>
            </form>
          </div>

          <div className="space-y-6">
            <form
              onSubmit={handleBiometricEnroll}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">
                  Voice Biometric Enrollment
                </h3>
                <span className="text-xs uppercase tracking-wide text-slate-300">
                  Security
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-300">
                Upload a 10-20 second WAV sample to register the caller&apos;s
                voice signature.
              </p>
              <label className="mt-4 flex h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-400/40 bg-emerald-900/20 text-center text-sm text-emerald-200 transition hover:bg-emerald-900/40">
                <input
                  type="file"
                  accept="audio/wav,audio/x-wav"
                  className="hidden"
                  onChange={(event) =>
                    setBiometricFile(event.target.files?.[0] ?? null)
                  }
                />
                {biometricFile ? (
                  <>
                    <span className="font-semibold">{biometricFile.name}</span>
                    <span className="text-xs text-emerald-300">
                      Ready for enrollment
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">
                      Drop WAV file or click to upload
                    </span>
                    <span className="text-xs text-emerald-300">
                      We extract non-reversible audio features
                    </span>
                  </>
                )}
              </label>
              <button
                type="submit"
                disabled={isEnrolling}
                className="mt-4 inline-flex items-center rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm shadow-emerald-400/30 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-700/60"
              >
                {isEnrolling ? "Enrolling…" : "Enroll voiceprint"}
              </button>
            </form>

            <form
              onSubmit={handleBiometricVerify}
              className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">
                  Voice Verification
                </h3>
                <span className="text-xs uppercase tracking-wide text-slate-300">
                  Real-time gatekeeping
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-300">
                Upload a verification sample to match against the enrolled
                signature before routing to live agents.
              </p>
              <label className="mt-4 flex h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-blue-400/40 bg-blue-900/20 text-center text-sm text-blue-100 transition hover:bg-blue-900/40">
                <input
                  type="file"
                  accept="audio/wav,audio/x-wav"
                  className="hidden"
                  onChange={(event) =>
                    setVerificationFile(event.target.files?.[0] ?? null)
                  }
                />
                {verificationFile ? (
                  <>
                    <span className="font-semibold">
                      {verificationFile.name}
                    </span>
                    <span className="text-xs text-blue-200">
                      Ready to verify
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">
                      Drop WAV file or click to upload
                    </span>
                    <span className="text-xs text-blue-200">
                      We compare acoustic fingerprints
                    </span>
                  </>
                )}
              </label>
              <button
                type="submit"
                disabled={isVerifying}
                className="mt-4 inline-flex items-center rounded-xl bg-blue-400 px-4 py-2 text-sm font-semibold text-blue-950 shadow-sm shadow-blue-400/30 hover:bg-blue-300 disabled:cursor-not-allowed disabled:bg-blue-700/60"
              >
                {isVerifying ? "Verifying…" : "Verify caller"}
              </button>
            </form>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-emerald-500/10 backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                Call Intelligence Feed
              </h2>
              <p className="text-sm text-slate-300">
                Live transcription, AI summaries, sentiment scores and key
                highlights for every inbound and outbound touchpoint.
              </p>
            </div>
            <button
              onClick={refreshCalls}
              className="inline-flex items-center rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-inset ring-white/20 transition hover:bg-white/20"
            >
              Refresh feed
            </button>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-300">
                <tr>
                  <th className="pb-3 pr-4">Call</th>
                  <th className="pb-3 pr-4">Direction</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Sentiment</th>
                  <th className="pb-3 pr-4">Highlights</th>
                  <th className="pb-3 pr-4">Summary</th>
                  <th className="pb-3 pr-4">Recording</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      Loading intelligence feed…
                    </td>
                  </tr>
                ) : calls.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      No call logs yet. Launch an outbound campaign to get
                      started.
                    </td>
                  </tr>
                ) : (
                  calls.map((call) => {
                    const highlights = Array.isArray(call.highlights)
                      ? call.highlights
                      : call.highlights && typeof call.highlights === "object"
                      ? Object.values(
                          call.highlights as Record<string, string>
                        )
                      : [];
                    return (
                      <tr key={call.id}>
                        <td className="py-4 pr-4 font-medium">
                          #{call.id} · {call.call_sid?.slice(-8) ?? "pending"}
                          <p className="text-xs text-slate-400">
                            {new Date(call.started_at).toLocaleString()}
                          </p>
                      </td>
                      <td className="py-4 pr-4 capitalize text-slate-300">
                        {call.direction}
                      </td>
                      <td className="py-4 pr-4">
                        <span className={badgeClassName(call.status)}>
                          {call.status}
                        </span>
                      </td>
                      <td className="py-4 pr-4">
                        {call.sentiment ? (
                          <div>
                            <p className="font-medium text-white">
                              {call.sentiment}
                            </p>
                            {typeof call.sentiment_score === "number" && (
                              <p className="text-xs text-slate-300">
                                Score: {call.sentiment_score.toFixed(2)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">
                            Pending analysis
                          </span>
                        )}
                      </td>
                        <td className="py-4 pr-4">
                          {highlights.length > 0 ? (
                            <ul className="space-y-1 text-xs text-emerald-200">
                              {highlights.map((highlight, index) => (
                                <li key={`${call.id}-highlight-${index}`}>
                                  • {highlight}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-xs text-slate-500">
                              Awaiting highlights
                            </span>
                          )}
                        </td>
                      <td className="py-4 pr-4">
                        {call.summary ? (
                          <p className="max-w-xs text-xs text-slate-200">
                            {call.summary}
                          </p>
                        ) : call.transcript ? (
                          <p className="max-w-xs text-xs text-slate-200">
                            {call.transcript.slice(0, 180)}…
                          </p>
                        ) : (
                          <span className="text-xs text-slate-500">
                            Awaiting summary
                          </span>
                        )}
                      </td>
                        <td className="py-4 pr-4">
                          {call.recording_url ? (
                            <a
                              href={call.recording_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-emerald-300 hover:text-emerald-200"
                            >
                              Listen
                            </a>
                          ) : (
                            <span className="text-xs text-slate-500">
                              Processing
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
