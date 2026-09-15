import { z } from "zod";

// OpenAI Live protocol, verified 2026-09-14:
// https://developers.openai.com/api/docs/guides/live-conversations
export const LiveSessionRequestSchema = z.object({
  agentId: z.string().min(1),
  sdp: z.string().min(1).max(65_536),
});

export const LiveSessionResponseSchema = z.object({
  session: z.object({ id: z.string() }),
  transport: z.object({ type: z.literal("webrtc"), sdp: z.string() }),
});

export type LiveSessionResponse = z.infer<typeof LiveSessionResponseSchema>;

const transcriptFields = {
  event_id: z.string(),
  delta: z.string(),
  start_ms: z.number(),
  end_ms: z.number(),
};

// Parse the events we consume; unknown events remain forward compatible.
export const LiveEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session.started") }),
  z.object({
    type: z.literal("session.input_transcript.delta"),
    ...transcriptFields,
  }),
  z.object({
    type: z.literal("session.output_transcript.delta"),
    ...transcriptFields,
  }),
  z.object({
    type: z.literal("session.delegation.created"),
    offset_ms: z.number(),
    delegation: z.object({ id: z.string(), target: z.literal("client") }),
  }),
  z.object({
    type: z.literal("session.usage.updated"),
    usage: z.object({ seconds: z.number() }),
  }),
  z.object({
    type: z.literal("session.closed"),
    usage: z.object({ seconds: z.number() }),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("error"),
    error: z.object({ message: z.string(), code: z.string().optional() }),
  }),
]);

export type LiveEvent = z.infer<typeof LiveEventSchema>;

export interface LiveTranscriptFragment {
  id: string;
  speaker: "user" | "assistant";
  text: string;
  startMs: number;
  endMs: number;
}

export type LiveConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "closing"
  | "closed"
  | "error";
