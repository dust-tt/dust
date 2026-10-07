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
