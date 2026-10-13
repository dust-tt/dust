import { dfmCommentSchema, dfmCommentsSchema } from "@app/lib/markdown/dfm";
import { z } from "zod";

/** The Yjs fragment holding a live document's body, read by the server and bound by the editor. */
export const BODY_FRAGMENT_NAME = "body";

const DOCUMENT_NAME_SEPARATOR = ":";

// TODO(co-edition step 8): key on a stable file id. A rename during a session leaves editors on
// the old path, and saving there (step 9) would recreate the file.
/** The name a live document goes by on the WebSocket: workspace and file path. */
export function toSessionName(
  workspaceId: string,
  canonicalPath: string
): string {
  return `${workspaceId}${DOCUMENT_NAME_SEPARATOR}${canonicalPath}`;
}

export function parseSessionName(
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

export const commentRequestSchema = z.discriminatedUnion("type", [
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

export type CommentRequest = z.infer<typeof commentRequestSchema>;

export const commentClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("threads") }),
  z.object({
    type: z.literal("command"),
    requestId: z.string().min(1),
    command: commentRequestSchema,
  }),
]);

export type CommentClientMessage = z.infer<typeof commentClientMessageSchema>;

export const COMMENT_REQUEST_ERROR_CODES = [
  "unavailable",
  "not_found",
  "thread_changed",
  "unwritable",
] as const;

export type CommentRequestErrorCode =
  (typeof COMMENT_REQUEST_ERROR_CODES)[number];

export const commentServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("threads"), comments: dfmCommentsSchema }),
  z.object({
    type: z.literal("accepted"),
    requestId: z.string(),
    comment: dfmCommentSchema.nullable(),
  }),
  z.object({
    type: z.literal("refused"),
    requestId: z.string(),
    error: z.enum(COMMENT_REQUEST_ERROR_CODES),
  }),
]);

export type CommentServerMessage = z.infer<typeof commentServerMessageSchema>;

/** The agent reading or changing a live document, as its editors show it. */
export const collabAgentSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
});

export type CollabAgent = z.infer<typeof collabAgentSchema>;

/**
 * What an agent is doing in a live document, pushed to its editors as a stateless message.
 * `editing` goes out just before the agent's change is applied: Hocuspocus may batch document
 * updates but sends stateless messages at once, so an editor receives it first.
 */
export const AGENT_ACTIVITIES = ["reading", "editing"] as const;

export type AgentActivity = (typeof AGENT_ACTIVITIES)[number];

export const agentActivityMessageSchema = z.object({
  type: z.literal("agent_activity"),
  agent: collabAgentSchema,
  activity: z.enum(AGENT_ACTIVITIES),
});

export type AgentActivityMessage = z.infer<typeof agentActivityMessageSchema>;

/** Yjs items by id: `length` consecutive clocks of `client`, from `clock`. */
const insertedIdRangeSchema = z.object({
  client: z.number().int().nonnegative(),
  clock: z.number().int().nonnegative(),
  length: z.number().int().positive(),
});

export type InsertedIdRange = z.infer<typeof insertedIdRangeSchema>;

/** One range per client a change advances: an agent's change holds one, other ranges are noise. */
const AGENT_EDIT_MAX_RANGES = 16;

/**
 * The text an agent's change inserted in a live document, by Yjs item ids, so editors highlight
 * exactly that text and no one else's. Sent right after the change's update.
 */
export const agentEditMessageSchema = z.object({
  type: z.literal("agent_edit"),
  agent: collabAgentSchema,
  inserted: z.array(insertedIdRangeSchema).max(AGENT_EDIT_MAX_RANGES),
});

export type AgentEditMessage = z.infer<typeof agentEditMessageSchema>;
