import { z } from "zod";

/**
 * Per-run conversation context mode.
 *
 * - `full`: the agent run renders the conversation the way it always has. This is the default
 *   everywhere: old clients, old rows, old workflow payloads and API callers that omit the field
 *   all resolve to it.
 * - `isolated`: the agent run initiated by the marked user message renders no conversation-derived
 *   material that predates that message. The message and its answer are still persisted and shown
 *   in the transcript, and the next ordinary message goes back to `full` rendering.
 *
 * This controls conversation context only. It is not an authorization, retention or privacy
 * boundary: nothing is hidden, deleted or moved, and every workspace/space/tool/billing check is
 * unchanged.
 */
export const CONVERSATION_CONTEXT_MODES = ["full", "isolated"] as const;

export const ConversationContextModeSchema = z.enum(CONVERSATION_CONTEXT_MODES);

export type ConversationContextMode = z.infer<
  typeof ConversationContextModeSchema
>;

export const DEFAULT_CONVERSATION_CONTEXT_MODE: ConversationContextMode =
  "full";

/**
 * Resolves a persisted or request-supplied value to a mode. Anything unknown — including the
 * `null` stored on every row created before the feature shipped — resolves to `full`, so a run can
 * never silently become isolated and a legacy row can never fail to execute.
 */
export function normalizeConversationContextMode(
  value: string | null | undefined
): ConversationContextMode {
  const parsed = ConversationContextModeSchema.safeParse(value);

  return parsed.success ? parsed.data : DEFAULT_CONVERSATION_CONTEXT_MODE;
}

export function isIsolatedConversationContextMode(
  value: string | null | undefined
): boolean {
  return normalizeConversationContextMode(value) === "isolated";
}
