import { dfmCommentSchema, dfmCommentsSchema } from "@app/lib/markdown/dfm";
import { z } from "zod";

/** The Yjs fragment holding a live document's body, read by the server and bound by the editor. */
export const BODY_FRAGMENT_NAME = "body";

const DOCUMENT_NAME_SEPARATOR = ":";

// TODO(co-edition step 8): key on a stable file id. A rename during a session leaves editors on
// the old path, and saving there (step 9) would recreate the file.
/** The name a live document goes by on the WebSocket: workspace and file path. */
export function toLiveDocumentName(
  workspaceId: string,
  canonicalPath: string
): string {
  return `${workspaceId}${DOCUMENT_NAME_SEPARATOR}${canonicalPath}`;
}

export function parseLiveDocumentName(
  documentName: string
): { workspaceId: string; canonicalPath: string } | null {
  const index = documentName.indexOf(DOCUMENT_NAME_SEPARATOR);
  if (index <= 0 || index === documentName.length - 1) {
    return null;
  }
  return {
    workspaceId: documentName.slice(0, index),
    canonicalPath: documentName.slice(index + 1),
  };
}

/**
 * Comment threads in a live session travel beside the shared document, as Hocuspocus stateless
 * messages: the browser sends commands, the server answers each one and pushes every change of
 * the threads to all the document's browsers.
 */

const commentIdSchema = z.string().min(1);

export const liveCommentCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add"),
    commentId: commentIdSchema,
    body: z.string().min(1),
    // The text the browser anchors once the thread exists, which agents get as the quote.
    quote: z.string().optional(),
  }),
  z.object({
    type: z.literal("reply"),
    commentId: commentIdSchema,
    position: z.number().int().min(1),
    body: z.string().min(1),
  }),
  z.object({
    type: z.literal("resolve"),
    commentId: commentIdSchema,
    resolved: z.boolean(),
  }),
  z.object({ type: z.literal("delete"), commentId: commentIdSchema }),
]);

export type LiveCommentCommand = z.infer<typeof liveCommentCommandSchema>;

export const liveCommentClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("threads") }),
  z.object({
    type: z.literal("command"),
    requestId: z.string().min(1),
    command: liveCommentCommandSchema,
  }),
]);

export type LiveCommentClientMessage = z.infer<
  typeof liveCommentClientMessageSchema
>;

export const LIVE_COMMENT_ERROR_CODES = [
  "unavailable",
  "not_found",
  "thread_changed",
  "unwritable",
] as const;

export type LiveCommentErrorCode = (typeof LIVE_COMMENT_ERROR_CODES)[number];

export const liveCommentServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("threads"), comments: dfmCommentsSchema }),
  z.object({
    type: z.literal("accepted"),
    requestId: z.string(),
    comment: dfmCommentSchema.nullable(),
  }),
  z.object({
    type: z.literal("refused"),
    requestId: z.string(),
    error: z.enum(LIVE_COMMENT_ERROR_CODES),
  }),
]);

export type LiveCommentServerMessage = z.infer<
  typeof liveCommentServerMessageSchema
>;

/** The agent reading or changing a live document, as its editors show it. */
export const liveAgentSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
});

export type LiveAgent = z.infer<typeof liveAgentSchema>;

/**
 * What an agent is doing in a live document, pushed to its editors as a stateless message.
 * `editing` goes out just before the agent's change is applied: Hocuspocus may batch document
 * updates but sends stateless messages at once, so an editor receives it first.
 */
export const LIVE_AGENT_ACTIVITIES = ["reading", "editing"] as const;

export type LiveAgentActivity = (typeof LIVE_AGENT_ACTIVITIES)[number];

export const liveAgentServerMessageSchema = z.object({
  type: z.literal("agent_activity"),
  agent: liveAgentSchema,
  activity: z.enum(LIVE_AGENT_ACTIVITIES),
});

export type LiveAgentServerMessage = z.infer<
  typeof liveAgentServerMessageSchema
>;

/** Yjs items by id: `length` consecutive clocks of `client`, from `clock`. */
const liveIdRangeSchema = z.object({
  client: z.number().int().nonnegative(),
  clock: z.number().int().nonnegative(),
  length: z.number().int().positive(),
});

export type LiveIdRange = z.infer<typeof liveIdRangeSchema>;

/** One range per client a change advances: an agent's change holds one, other ranges are noise. */
const LIVE_AGENT_EDIT_MAX_RANGES = 16;

/**
 * The text an agent's change inserted in a live document, by Yjs item ids, so editors highlight
 * exactly that text and no one else's. Sent right after the change's update.
 */
export const liveAgentEditMessageSchema = z.object({
  type: z.literal("agent_edit"),
  agent: liveAgentSchema,
  inserted: z.array(liveIdRangeSchema).max(LIVE_AGENT_EDIT_MAX_RANGES),
});

export type LiveAgentEditMessage = z.infer<typeof liveAgentEditMessageSchema>;
