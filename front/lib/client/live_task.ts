import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { z } from "zod";

const ActionSchema = z.object({
  sId: z.string(),
  status: z.string(),
  toolName: z.string().nullish(),
  displayLabels: z.object({ running: z.string(), done: z.string() }).nullish(),
});

const TaskEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("generation_tokens"),
    messageId: z.string(),
    step: z.number(),
    traceId: z.string().optional(),
    classification: z.string(),
    text: z.string(),
  }),
  z.object({
    type: z.literal("tool_params"),
    messageId: z.string(),
    action: ActionSchema,
  }),
  z.object({
    type: z.literal("agent_action_success"),
    messageId: z.string(),
    action: ActionSchema,
  }),
  z.object({ type: z.literal("end-of-stream") }),
]);

const TaskFrameSchema = z.object({
  eventId: z.string(),
  data: TaskEventSchema,
});

export interface LiveTaskUpdate {
  type: "session.thinking.append" | "session.commentary.append";
  content: string;
  status?: string;
}

/**
 * @cc [owner:aubin-tchoi,label:security;product] live-public-updates-only
 * Only public answer tokens and tool status MAY enter the voice session. Private
 * reasoning, raw tool arguments, and raw tool outputs MUST NOT be relayed.
 * Replayed events and retried generation prefixes MUST NOT repeat spoken text.
 */
export class LiveTaskRelay {
  lastEventId = "";
  ended = false;
  private seen = new Set<string>();
  private toolStates = new Set<string>();
  private step: number | null = null;
  private traceId: string | undefined;
  private text = "";
  private spoken = "";

  constructor(private messageId: string) {}

  receive(raw: string): LiveTaskUpdate[] {
    if (this.ended) {
      return [];
    }
    const json = safeParseJSON(raw);
    if (json.isErr()) {
      return [];
    }
    const parsed = TaskFrameSchema.safeParse(json.value);
    if (!parsed.success || this.seen.has(parsed.data.eventId)) {
      return [];
    }
    const { eventId, data } = parsed.data;
    if (data.type !== "end-of-stream" && data.messageId !== this.messageId) {
      return [];
    }
    this.seen.add(eventId);
    this.lastEventId = eventId;
    switch (data.type) {
      case "end-of-stream":
        this.ended = true;
        return this.flush();
      case "generation_tokens": {
        if (data.classification !== "tokens") {
          return [];
        }
        const updates: LiveTaskUpdate[] = [];
        if (this.step !== data.step) {
          updates.push(...this.flush());
          this.step = data.step;
          this.text = "";
          this.spoken = "";
        } else if (this.traceId !== data.traceId) {
          // A Temporal retry regenerates this step; retain the spoken prefix.
          this.text = "";
        }
        this.traceId = data.traceId;
        this.text += data.text;
        if (!this.text.startsWith(this.spoken)) {
          return updates;
        }
        const pending = this.text.slice(this.spoken.length);
        // Wait for a complete sentence or paragraph, never speak token fragments.
        const boundaries = [...pending.matchAll(/[.!?](?=\s)|\n/g)];
        const boundary = boundaries.at(-1);
        if (boundary?.index !== undefined) {
          const content = pending.slice(0, boundary.index + 1);
          this.spoken += content;
          if (content.trim()) {
            updates.push({ type: "session.commentary.append", content });
          }
        }
        return updates;
      }
      case "tool_params":
      case "agent_action_success": {
        const key = `${data.action.sId}:${data.action.status}`;
        if (this.toolStates.has(key)) {
          return [];
        }
        this.toolStates.add(key);
        const completed = data.type === "agent_action_success";
        const label =
          data.action.displayLabels?.[completed ? "done" : "running"] ??
          data.action.toolName ??
          "Tool";
        const content = completed
          ? `Tool finished (${data.action.status}): ${label}.`
          : `Tool in progress: ${label}. Its result is not confirmed yet.`;
        return [
          ...this.flush(),
          { type: "session.thinking.append", content, status: label },
        ];
      }
    }
  }

  // The persisted final answer is authoritative, including after SSE failure.
  complete(content: string): LiveTaskUpdate[] {
    this.ended = true;
    this.text = content;
    return this.flush();
  }

  private flush(): LiveTaskUpdate[] {
    if (this.text.startsWith(this.spoken)) {
      const content = this.text.slice(this.spoken.length);
      this.spoken = this.text;
      return content.trim()
        ? [{ type: "session.commentary.append", content }]
        : [];
    }
    if (this.spoken.startsWith(this.text)) {
      return [];
    }
    // Already-spoken text cannot be retracted if a generation retry diverges.
    const content = `Correction: ${this.text}`;
    this.spoken = this.text;
    return [{ type: "session.commentary.append", content }];
  }
}
