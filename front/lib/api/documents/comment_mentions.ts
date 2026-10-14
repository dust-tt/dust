import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import type { NewCommentMessage } from "@app/lib/api/documents/comment_signatures";
import {
  DustFileSystem,
  parseScopedPrefix,
} from "@app/lib/api/file_system/dust_file_system";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLockResult } from "@app/lib/lock";
import { getFileNameFromScopedPath } from "@app/lib/markdown/file_preview";
import { extractFromString } from "@app/lib/mentions/format";
import { notifyNewProjectConversation } from "@app/lib/notifications/triggers/project-new-conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { launchDocumentCommentMentionWorkflow } from "@app/temporal/mentions_queue/client";
import { serializeDocumentCommentDirective } from "@app/types/assistant/document_comment";
import type { AgentMention } from "@app/types/assistant/mentions";
import { isAgentMention } from "@app/types/assistant/mentions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Comments that mention an agent reach it the way a conversation message does: each one is
 * posted as a user message in the document's conversation, which runs the agent. Mentioned users
 * are notified apart, never through the conversation.
 */

/**
 * @cc [owner:tdraier,label:product] document-conversation
 * A file in a conversation's files MUST use that conversation. A file in a pod MUST use the
 * pod's conversation linked to its normalized path, created in the pod on first use without
 * notifying the pod, and `isPodDocument` MUST tell this second case; callers MUST hold the
 * document's lock, so concurrent posts share one conversation. Any other file has no conversation.
 */
async function getDocumentConversation(
  auth: Authenticator,
  documentPath: string
): Promise<{
  conversation: ConversationResource;
  isPodDocument: boolean;
} | null> {
  const scope = parseScopedPrefix(documentPath);
  if (!scope) {
    return null;
  }

  switch (scope.kind) {
    case "conversation": {
      const conversation = await ConversationResource.fetchById(auth, scope.id);
      return conversation ? { conversation, isPodDocument: false } : null;
    }
    case "pod": {
      const pod = await SpaceResource.fetchById(auth, scope.id);
      if (!pod) {
        return null;
      }
      const existing = await ConversationResource.fetchLatestForDocument(auth, {
        space: pod,
        documentPath,
      });
      if (existing) {
        return { conversation: existing, isPodDocument: true };
      }
      const conversation = await createConversation(auth, {
        title: `Comments · ${getFileNameFromScopedPath(documentPath)}`,
        visibility: "unlisted",
        spaceId: pod.id,
        metadata: { dfmDocumentPath: documentPath },
        notifyPodMembers: false,
      });
      return { conversation, isPodDocument: true };
    }
    case "conversation_metadata":
    case "user":
      return null;
    default:
      return assertNever(scope);
  }
}

/**
 * The agent a comment runs. A conversation message runs at most one agent, so only the first agent
 * mentioned is kept; users are notified apart from the conversation.
 */
function getAgentMentionFromComment(body: string): {
  agent: AgentMention | undefined;
  skippedAgents: number;
} {
  const agentIds = new Set(
    extractFromString(body)
      .filter(isAgentMention)
      .map((mention) => mention.configurationId)
  );
  const [first] = agentIds;
  return {
    agent: first ? { configurationId: first } : undefined,
    skippedAgents: Math.max(agentIds.size - 1, 0),
  };
}

/**
 * @cc [owner:tdraier,label:product] document-comment-message
 * The user message for a comment MUST open with the `serializeDocumentCommentDirective` of the
 * thread's id, the document's path and the quoted passage, if any, followed by the new message as
 * written. It MUST NOT repeat the thread's earlier messages, which agents read in the document.
 */
function commentMessageContent(
  documentPath: string,
  { commentId, quote, message }: NewCommentMessage
): string {
  return `${serializeDocumentCommentDirective({ commentId, documentPath, quote })}\n\n${message.body}`;
}

/**
 * @cc [owner:tdraier,label:product;performance] document-comment-mentions
 * Each new message that mentions agents or users MUST be handed to a durable job keyed by the
 * normalized document path and the message, so however often it is handed over, its mentioned
 * users are notified once and, when it mentions an agent, it is posted once. The caller MUST NOT
 * wait for that job. Messages without mentions MUST NOT be handed over. A failure MUST be logged
 * and MUST NOT fail the caller.
 */
export async function dispatchCommentMentions(
  auth: Authenticator,
  {
    scopedPath,
    newMessages,
  }: { scopedPath: string; newMessages: NewCommentMessage[] }
): Promise<void> {
  const mentioning = newMessages.filter(
    ({ message }) => extractFromString(message.body).length > 0
  );
  const resolvedPath = DustFileSystem.resolveScopedPath(scopedPath);
  if (!auth.user() || mentioning.length === 0 || resolvedPath.isErr()) {
    return;
  }

  const authType = auth.toJSON();
  await concurrentExecutor(
    mentioning,
    async (newMessage) => {
      const launched = await launchDocumentCommentMentionWorkflow({
        authType,
        documentPath: resolvedPath.value,
        newMessage,
      });
      if (launched.isErr()) {
        logger.error(
          {
            workspaceId: authType.workspaceId,
            scopedPath: resolvedPath.value,
            commentId: newMessage.commentId,
            err: launched.error,
          },
          "Failed to dispatch a document comment with mentions."
        );
      }
    },
    { concurrency: 4 }
  );
}

export class DocumentConversationBusyError extends Error {
  constructor() {
    super("The document's conversation is busy.");
    this.name = "DocumentConversationBusyError";
  }
}

/**
 * @cc [owner:tdraier,label:product] document-comment-mention-post
 * A dispatched message that mentions an agent MUST be posted as the saving user, as a user
 * message with the `document_comment` origin in the document's conversation, so the mentioned
 * agent runs as in a conversation. As in a conversation, a message runs at most one agent: only
 * the first agent mentioned is kept, and the others are logged. The message MUST NOT carry any
 * user mention, and a message mentioning no agent MUST NOT be posted, nor its conversation
 * created. It MUST be posted with `onlyWhenIdle`, and while an agent or a compaction runs in that conversation, or the document's
 * lock cannot be taken, it MUST return a `DocumentConversationBusyError` having posted nothing, so
 * each comment gets its own turn instead of steering a running agent. A pod document's
 * conversation MUST notify the pod when its first message is posted, never before. Any other
 * failure MUST be logged and the message dropped.
 */
export async function postCommentMention(
  auth: Authenticator,
  {
    documentPath,
    newMessage,
  }: { documentPath: string; newMessage: NewCommentMessage }
): Promise<Result<undefined, DocumentConversationBusyError>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const user = auth.user();
  if (!user) {
    return new Ok(undefined);
  }

  const { agent, skippedAgents } = getAgentMentionFromComment(
    newMessage.message.body
  );
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
  if (!agent) {
    return new Ok(undefined);
  }

  const locked = await executeWithLockResult(
    `dfm_document_conversation_${workspaceId}_${documentPath}`,
    async (): Promise<Result<undefined, DocumentConversationBusyError>> => {
      const found = await getDocumentConversation(auth, documentPath);
      if (!found) {
        logger.warn(
          { workspaceId, scopedPath: documentPath },
          "No conversation for a document comment with mentions."
        );
        return new Ok(undefined);
      }
      const { conversation, isPodDocument } = found;

      const posted = await postUserMessage(auth, {
        conversationResource: conversation,
        content: commentMessageContent(documentPath, newMessage),
        mentions: [agent],
        context: {
          timezone: "UTC",
          username: user.username,
          fullName: user.fullName(),
          email: user.email,
          profilePictureUrl: user.imageUrl,
          origin: "document_comment",
        },
        skipToolsValidation: false,
        onlyWhenIdle: true,
      });
      if (posted.isErr()) {
        if (posted.error.status_code === 409) {
          return new Err(new DocumentConversationBusyError());
        }
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
        return new Ok(undefined);
      }

      if (isPodDocument && posted.value.userMessage.rank === 0) {
        notifyNewProjectConversation(auth, {
          conversation: conversation.toJSON(),
        });
      }
      return new Ok(undefined);
    }
  );
  return locked.isErr() ? new Err(new DocumentConversationBusyError()) : locked;
}
