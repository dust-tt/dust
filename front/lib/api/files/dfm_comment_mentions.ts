import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { RUNNING_AGENT_SWITCH_BLOCK_MESSAGE } from "@app/lib/api/assistant/errors";
import {
  DustFileSystem,
  parseScopedPrefix,
} from "@app/lib/api/file_system/dust_file_system";
import type { NewCommentMessage } from "@app/lib/api/files/dfm_comment_signatures";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLock } from "@app/lib/lock";
import { getFileNameFromScopedPath } from "@app/lib/markdown/file_preview";
import { extractFromString } from "@app/lib/mentions/format";
import { notifyNewProjectConversation } from "@app/lib/notifications/triggers/project-new-conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { launchDocumentCommentMentionWorkflow } from "@app/temporal/mentions_queue/client";
import type { MentionType } from "@app/types/assistant/mentions";
import { isAgentMention } from "@app/types/assistant/mentions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Comments that mention agents or users reach them the way a conversation message does: each
 * one is posted as a user message in the document's conversation, which runs the mentioned
 * agents and notifies the mentioned users.
 */

/**
 * @cc [owner:tdraier,label:product] document-conversation
 * A file in a conversation's files MUST use that conversation. A file in a pod MUST use the
 * pod's conversation linked to its normalized path, created in the pod on first use without
 * notifying the pod, and `isNew` MUST tell its creation; callers MUST hold the document's lock,
 * so concurrent posts share one conversation. Any other file has no conversation.
 */
async function getDocumentConversation(
  auth: Authenticator,
  documentPath: string
): Promise<{ conversation: ConversationResource; isNew: boolean } | null> {
  const scope = parseScopedPrefix(documentPath);
  if (!scope) {
    return null;
  }

  switch (scope.kind) {
    case "conversation": {
      const conversation = await ConversationResource.fetchById(auth, scope.id);
      return conversation ? { conversation, isNew: false } : null;
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
        return { conversation: existing, isNew: false };
      }
      const conversation = await createConversation(auth, {
        title: `Comments · ${getFileNameFromScopedPath(documentPath)}`,
        visibility: "unlisted",
        spaceId: pod.id,
        metadata: { dfmDocumentPath: documentPath },
        notifyPodMembers: false,
      });
      return { conversation, isNew: true };
    }
    case "user":
      return null;
    default:
      return assertNever(scope);
  }
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
  documentPath: string,
  { quote, message }: NewCommentMessage
): string {
  const quoted =
    quote === null ? "" : `\n\n> ${quote.replace(/\s+/g, " ").trim()}`;
  return `Comment on \`${documentPath}\`:${quoted}\n\n${message.body}`;
}

/**
 * @cc [owner:tdraier,label:product;performance] document-comment-mentions
 * Each new message of a save that mentions agents or users MUST be handed to a durable job
 * keyed by the normalized document path and the message, so it is posted once however many
 * saves bring it, and the save MUST NOT wait for it to be posted. Messages without mentions MUST
 * NOT be handed over. A failure MUST be logged and MUST NOT undo or fail the save.
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
 * A dispatched message MUST be posted as the saving user, as a user message in the document's
 * conversation carrying each mention once, so the mentioned agent runs and mentioned users are
 * notified as in a conversation. As in a conversation, a message runs at most one agent: only
 * the first agent mentioned is kept, and the others are logged. While an agent or a compaction
 * runs in that conversation, it MUST NOT be posted and MUST return a
 * `DocumentConversationBusyError`, so each comment gets its own turn instead of steering a
 * running agent or being refused. A pod
 * document's new conversation MUST notify the pod only once a message is posted in it. Any other
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

  const { mentions, skippedAgents } = commentMentions(newMessage.message.body);
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

  return executeWithLock(
    `dfm_document_conversation_${workspaceId}_${documentPath}`,
    async () => {
      const found = await getDocumentConversation(auth, documentPath);
      if (!found) {
        logger.warn(
          { workspaceId, scopedPath: documentPath },
          "No conversation for a document comment with mentions."
        );
        return new Ok(undefined);
      }
      const { conversation, isNew } = found;

      const { runningAgentMessage, runningCompactionMessage } =
        await conversation.getInFlightMessages(auth);
      if (runningAgentMessage || runningCompactionMessage) {
        return new Err(new DocumentConversationBusyError());
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
        // The conversation became busy between the check above and the post.
        if (
          posted.error.api_error.message ===
            RUNNING_AGENT_SWITCH_BLOCK_MESSAGE ||
          posted.error.status_code === 409
        ) {
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

      if (isNew) {
        notifyNewProjectConversation(auth, {
          conversation: conversation.toJSON(),
        });
      }
      return new Ok(undefined);
    }
  );
}
