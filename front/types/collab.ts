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

/**
 * Agents change a live document through the collab server's internal routes: they read the
 * session's source, change it, then write it back conditional on the source they read.
 */

/** Where the collab server mounts the routes only reached from inside the cluster. */
export const COLLAB_INTERNAL_ROUTES_PREFIX = "/internal";
export const LIVE_SOURCE_READ_PATH = "/documents/read";
export const LIVE_SOURCE_WRITE_PATH = "/documents/write";

/** The agent reading or changing a live document, as its editors show it. */
export const liveAgentSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
});

export type LiveAgent = z.infer<typeof liveAgentSchema>;

export const liveSourceReadRequestSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1).optional(),
  canonicalPath: z.string().min(1),
  agent: liveAgentSchema.optional(),
});

export type LiveSourceReadRequest = z.infer<typeof liveSourceReadRequestSchema>;

/** What the collab server reports of a live document an agent wants to change. */
export const liveSourceReadResponseSchema = z.discriminatedUnion("open", [
  z.object({ open: z.literal(false) }),
  z.object({ open: z.literal(true), source: z.string() }),
]);

export type LiveSourceReadResponse = z.infer<
  typeof liveSourceReadResponseSchema
>;

export const LIVE_SOURCE_WRITE_RESULTS = [
  "written",
  "changed",
  "closed",
  "busy",
] as const;

/** How long a write may wait for its turn on the collab server, kept below its caller's timeout. */
export const LIVE_SOURCE_WRITE_WAIT_MS = 5 * 1000;

export type LiveSourceWriteResult = (typeof LIVE_SOURCE_WRITE_RESULTS)[number];

export const liveSourceWriteRequestSchema = liveSourceReadRequestSchema.extend({
  userId: z.string().min(1),
  base: z.string(),
  source: z.string(),
});

export type LiveSourceWriteRequest = z.infer<
  typeof liveSourceWriteRequestSchema
>;

export const liveSourceWriteResponseSchema = z.discriminatedUnion("result", [
  z.object({ result: z.enum(LIVE_SOURCE_WRITE_RESULTS) }),
  z.object({ result: z.literal("refused"), message: z.string() }),
]);

export type LiveSourceWriteResponse = z.infer<
  typeof liveSourceWriteResponseSchema
>;

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

/** A Yjs item, by id. */
const liveIdSchema = z.object({
  client: z.number().int().nonnegative(),
  clock: z.number().int().nonnegative(),
});

/** Yjs items by id: `length` consecutive clocks of `client`, from `clock`. */
const liveIdRangeSchema = liveIdSchema.extend({
  length: z.number().int().positive(),
});

export type LiveIdRange = z.infer<typeof liveIdRangeSchema>;

/** Past this many id ranges or removed texts, a change is not attributed: editors just show it. */
export const LIVE_ATTRIBUTION_MAX_RANGES = 2_000;

/** How many removed texts an attribution carries, the first ones: editors only preview them. */
export const LIVE_ATTRIBUTION_MAX_REMOVED = 200;

/** How much of a removed text an attribution carries, editors only showing its start. */
export const LIVE_REMOVED_TEXT_MAX_CHARS = 240;

/** Who made a change, as editors show it. */
const liveAuthorSchema = z.object({
  kind: z.literal("agent"),
  agentId: z.string().min(1),
  name: z.string().min(1),
});

export type LiveAuthor = z.infer<typeof liveAuthorSchema>;

/**
 * A change of a live document attributed to its author, in the shape of Yjs v14 attributions: the
 * Yjs items it inserted and deleted, so editors show exactly that change and no one else's text,
 * and the text it removed, which editors no longer hold, anchored at the item it starts with. Sent
 * while the change is applied, before its update.
 */
export const liveAttributionMessageSchema = z.object({
  type: z.literal("attribution"),
  author: liveAuthorSchema,
  /** When the change was applied, in milliseconds since the epoch. */
  at: z.number().int().nonnegative(),
  inserted: z.array(liveIdRangeSchema).max(LIVE_ATTRIBUTION_MAX_RANGES),
  deleted: z.array(liveIdRangeSchema).max(LIVE_ATTRIBUTION_MAX_RANGES),
  removed: z
    .array(
      z.object({
        // One more character than shown, so editors know to mark it cut.
        text: z.string().max(LIVE_REMOVED_TEXT_MAX_CHARS + 1),
        anchor: liveIdSchema,
      })
    )
    .max(LIVE_ATTRIBUTION_MAX_REMOVED),
});

export type LiveAttributionMessage = z.infer<
  typeof liveAttributionMessageSchema
>;
