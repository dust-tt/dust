import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import type { NewCommentMessage } from "@app/lib/api/files/dfm_comment_signatures";
import type { Authenticator } from "@app/lib/auth";
import { extractFromString } from "@app/lib/mentions/format";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import {
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/types/file_system";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Comments that mention agents or users reach them the way a conversation message does: each
 * one is posted as a user message in the document's conversation, which runs the mentioned
 * agents and notifies the mentioned users.
 */

function scopeId(scopedPath: string, prefix: string): string | null {
  if (!scopedPath.startsWith(prefix)) {
    return null;
  }
  const id = scopedPath.slice(prefix.length).split("/")[0];
  return id === "" ? null : id;
}

/**
 * @cc [owner:tdraier,label:product] document-conversation
 * A file in a conversation's files MUST use that conversation. A file in a pod MUST use the
 * pod's conversation linked to its path, created in the pod on first use. Any other file has
 * no conversation.
 */
async function getDocumentConversation(
  auth: Authenticator,
  scopedPath: string
): Promise<ConversationResource | null> {
  const conversationId = scopeId(scopedPath, SCOPED_PREFIX_CONVERSATION);
  if (conversationId) {
    return ConversationResource.fetchById(auth, conversationId);
  }

  const podId = scopeId(scopedPath, SCOPED_PREFIX_POD);
  if (!podId) {
    return null;
  }
  const pod = await SpaceResource.fetchById(auth, podId);
  if (!pod) {
    return null;
  }
  const existing = await ConversationResource.fetchLatestForDocument(auth, {
    space: pod,
    documentPath: scopedPath,
  });
  if (existing) {
    return existing;
  }
  const fileName = scopedPath.split("/").pop() ?? scopedPath;
  return createConversation(auth, {
    title: `Comments · ${fileName}`,
    visibility: "unlisted",
    spaceId: pod.id,
    metadata: { dfmDocumentPath: scopedPath },
  });
}

/** The user message for a comment: where it was left, on what, then its text with mentions. */
function commentMessageContent(
  scopedPath: string,
  { quote, message }: NewCommentMessage
): string {
  const quoted =
    quote === null
      ? ""
      : `\n\n> ${quote.replaceAll("\n", " ").replace(/\s+/g, " ").trim()}`;
  return `Comment on \`${scopedPath}\`:${quoted}\n\n${message.body}`;
}

/**
 * @cc [owner:tdraier,label:product] document-comment-mentions
 * Each new message of a save that mentions agents or users MUST be posted once, as the saving
 * user, as a user message in the document's conversation carrying those mentions, so mentioned
 * agents run and mentioned users are notified as in a conversation. Messages without mentions
 * MUST NOT be posted. A failure MUST be logged and MUST NOT undo or fail the save.
 */
export async function dispatchCommentMentions(
  auth: Authenticator,
  {
    scopedPath,
    newMessages,
  }: { scopedPath: string; newMessages: NewCommentMessage[] }
): Promise<void> {
  try {
    await postCommentMentions(auth, { scopedPath, newMessages });
  } catch (error) {
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        scopedPath,
        err: normalizeError(error),
      },
      "Failed to dispatch document comment mentions."
    );
  }
}

async function postCommentMentions(
  auth: Authenticator,
  {
    scopedPath,
    newMessages,
  }: { scopedPath: string; newMessages: NewCommentMessage[] }
): Promise<void> {
  const user = auth.user();
  const mentioning = newMessages
    .map((newMessage) => ({
      newMessage,
      mentions: extractFromString(newMessage.message.body),
    }))
    .filter(({ mentions }) => mentions.length > 0);
  if (!user || mentioning.length === 0) {
    return;
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const conversation = await getDocumentConversation(auth, scopedPath);
  if (!conversation) {
    logger.warn(
      { workspaceId, scopedPath },
      "No conversation for a document comment with mentions."
    );
    return;
  }

  for (const { newMessage, mentions } of mentioning) {
    const posted = await postUserMessage(auth, {
      conversationResource: conversation,
      content: commentMessageContent(scopedPath, newMessage),
      mentions,
      context: {
        timezone: "UTC",
        username: user.username,
        fullName: user.fullName(),
        email: user.email,
        profilePictureUrl: user.imageUrl,
        origin: "web",
      },
      skipToolsValidation: false,
    });
    if (posted.isErr()) {
      logger.error(
        {
          workspaceId,
          scopedPath,
          conversationId: conversation.sId,
          commentId: newMessage.commentId,
          error: posted.error.api_error.message,
        },
        "Failed to post a document comment with mentions."
      );
    }
  }
}
