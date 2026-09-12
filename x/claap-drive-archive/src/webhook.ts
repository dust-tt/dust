import { timingSafeEqual } from "node:crypto";

import type { ClaapRecording, ClaapWebhookEvent } from "./types.ts";

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(direct)) {
    return direct[0];
  }
  return direct;
}

export function verifyClaapWebhookSecret(
  headers: Record<string, string | string[] | undefined>,
  expectedSecret: string
): boolean {
  if (!expectedSecret) {
    return false;
  }
  const provided = headerValue(headers, "x-claap-webhook-secret");
  if (!provided) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expectedSecret);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function isClaapWebhookEvent(value: unknown): value is ClaapWebhookEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const event = (value as { event?: unknown }).event;
  if (!event || typeof event !== "object") {
    return false;
  }
  const type = (event as { type?: unknown }).type;
  const recording = (event as { recording?: unknown }).recording;
  return (
    (type === "recording_added" || type === "recording_updated") &&
    Boolean(recording) &&
    typeof recording === "object" &&
    typeof (recording as { id?: unknown }).id === "string"
  );
}

export function extractRecordingId(body: unknown): string | null {
  if (isClaapWebhookEvent(body)) {
    return body.event.recording.id;
  }
  if (body && typeof body === "object") {
    const recording = (body as { recording?: ClaapRecording }).recording;
    if (recording && typeof recording.id === "string") {
      return recording.id;
    }
    const id = (body as { recordingId?: unknown }).recordingId;
    if (typeof id === "string") {
      return id;
    }
  }
  return null;
}
