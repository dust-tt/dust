import type { DfmMessage } from "@app/lib/markdown/dfm/types";

/**
 * What a message signature covers. The server signs these bytes when it accepts a message and
 * the browser checks them with the public key; both build them here so they cannot drift.
 */

const PAYLOAD_VERSION = "dfm-message-v1";

/**
 * @cc [owner:tdraier,label:security] dfm-signature-payload
 * The payload MUST bind the workspace, the comment id, the author kind and id, the author name,
 * the timestamp and the body, so a signature cannot move to another workspace, thread or author
 * or survive an edit of the text. It MUST NOT cover the thread status, the anchors or the
 * signature itself. The encoding MUST be unambiguous: no two different inputs give the same
 * payload.
 */
export function messageSignaturePayload({
  workspaceId,
  commentId,
  message,
}: {
  workspaceId: string;
  commentId: string;
  message: Pick<DfmMessage, "author" | "createdAt" | "body">;
}): string {
  const { author, createdAt, body } = message;
  return JSON.stringify([
    PAYLOAD_VERSION,
    workspaceId,
    commentId,
    author.kind,
    author.id,
    author.name,
    createdAt,
    body,
  ]);
}
