import type { DfmMessage } from "@app/lib/markdown/dfm/types";

/**
 * What a message signature covers. The server signs these bytes when it accepts a message and
 * the browser checks them with the public key; both build them here so they cannot drift.
 */

const PAYLOAD_VERSION = "dfm-message-v2";

type SignedFields = Pick<DfmMessage, "author" | "createdAt" | "body">;

const signedFields = ({ author, createdAt, body }: SignedFields) => [
  author.kind,
  author.id,
  author.name,
  createdAt,
  body,
];

/**
 * @cc [owner:tdraier,label:security] dfm-signature-payload
 * The payload MUST bind the workspace, the file's scoped path, the comment id, the author kind
 * and id, the author name, the timestamp and the body, so a signature cannot move to another
 * workspace, file, thread or author or survive an edit of the text. It MUST also bind the
 * author, name, timestamp and body of the message before it in its thread, or the absence of
 * one, so a message cannot be reordered, duplicated or preceded by another without failing.
 * It MUST NOT cover the thread status, the anchors or any signature. The encoding MUST be
 * unambiguous: no two different inputs give the same payload.
 */
export function messageSignaturePayload({
  workspaceId,
  filePath,
  commentId,
  previous,
  message,
}: {
  workspaceId: string;
  filePath: string;
  commentId: string;
  previous: SignedFields | null;
  message: SignedFields;
}): string {
  return JSON.stringify([
    PAYLOAD_VERSION,
    workspaceId,
    filePath,
    commentId,
    previous ? signedFields(previous) : null,
    ...signedFields(message),
  ]);
}
