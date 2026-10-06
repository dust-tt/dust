import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { NewCommentMessage } from "@app/lib/api/files/dfm_comment_signatures";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
import { extractFromString } from "@app/lib/mentions/format";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { MentionType } from "@app/types/assistant/mentions";
import { isAgentMention } from "@app/types/assistant/mentions";
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
 * pod's conversation linked to its normalized path, created in the pod on first use; finding
 * and creating it MUST be atomic per document, so concurrent saves share one conversation. Any
 * other file has no conversation.
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
  const workspaceId = auth.getNonNullableWorkspace().sId;
  return executeWithLock(
    `dfm_document_conversation_${workspaceId}_${scopedPath}`,
    async () => {
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
  );
}

/**
 * A comment's mentions, each once. A conversation message runs at most one agent, so only the
 * first agent mentioned is kept.
 */
function commentMentions(body: string): {
  mentions: MentionType[];
  skippedAgents: number;
} {
  const seen = new Set<string>();
  const unique = extractFromString(body).filter((mention) => {
    const key = isAgentMention(mention)
      ? `agent:${mention.configurationId}`
      : `user:${mention.userId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  const agents = unique.filter(isAgentMention);
  return {
    mentions: unique.filter(
      (mention) => !isAgentMention(mention) || mention === agents[0]
    ),
    skippedAgents: Math.max(agents.length - 1, 0),
  };
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
 * user, as a user message in the document's conversation carrying each mention once, so the
 * mentioned agent runs and mentioned users are notified as in a conversation. As in a
 * conversation, a message runs at most one agent: only the first agent mentioned is kept, and
 * the others are logged. Messages without mentions MUST NOT be posted. A failure MUST be logged
 * and MUST NOT undo or fail the save.
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
      ...commentMentions(newMessage.message.body),
    }))
    .filter(({ mentions }) => mentions.length > 0);
  const resolvedPath = DustFileSystem.resolveScopedPath(scopedPath);
  if (!user || mentioning.length === 0 || resolvedPath.isErr()) {
    return;
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const documentPath = resolvedPath.value;
  const conversation = await getDocumentConversation(auth, documentPath);
  if (!conversation) {
    logger.warn(
      { workspaceId, scopedPath: documentPath },
      "No conversation for a document comment with mentions."
    );
    return;
  }

  for (const { newMessage, mentions, skippedAgents } of mentioning) {
    if (skippedAgents > 0) {
      logger.warn(
        {
          workspaceId,
          scopedPath: documentPath,
          commentId: newMessage.commentId,
          skippedAgents,
        },
        "Document comment mentions more than one agent; only the first runs."
      );
    }
    const posted = await postUserMessage(auth, {
      conversationResource: conversation,
      content: commentMessageContent(documentPath, newMessage),
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
          scopedPath: documentPath,
          conversationId: conversation.sId,
          commentId: newMessage.commentId,
          error: posted.error.api_error.message,
        },
        "Failed to post a document comment with mentions."
      );
    }
  }
}
