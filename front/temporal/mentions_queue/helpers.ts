import { createHash } from "node:crypto";
import type { NewCommentMessage } from "@app/lib/api/files/dfm_comment_signatures";
import { messageKey } from "@app/lib/api/files/dfm_comment_signatures";

export function makeMentionsWorkflowId({
  agentMessageId,
  conversationId,
  workspaceId,
}: {
  agentMessageId: string;
  conversationId: string;
  workspaceId: string;
}): string {
  return `mentions-${workspaceId}-${conversationId}-${agentMessageId}`;
}

export function makeDocumentCommentMentionWorkflowId({
  workspaceId,
  documentPath,
  newMessage: { commentId, message },
}: {
  workspaceId: string;
  documentPath: string;
  newMessage: NewCommentMessage;
}): string {
  const messageHash = createHash("sha256")
    .update(JSON.stringify([documentPath, messageKey(commentId, message)]))
    .digest("hex");
  return `document-comment-mention-${workspaceId}-${messageHash}`;
}
