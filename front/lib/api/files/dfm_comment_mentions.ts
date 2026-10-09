import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import {
  DustFileSystem,
  parseScopedPrefix,
} from "@app/lib/api/file_system/dust_file_system";
import type { NewCommentMessage } from "@app/lib/api/files/dfm_comment_signatures";
import type { Authenticator } from "@app/lib/auth";
import { executeWithLockResult } from "@app/lib/lock";
import { getFileNameFromScopedPath } from "@app/lib/markdown/file_preview";
import { extractFromString } from "@app/lib/mentions/format";
import { notifyNewProjectConversation } from "@app/lib/notifications/triggers/project-new-conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { documentCommentMessageHeading } from "@app/lib/resources/skill/code_defined/system/document_comments";
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
 * notifying the pod, and `isPodDocument` MUST tell this second case, `location` where the file
 * lives; callers MUST hold the document's lock, so concurrent posts share one conversation. Any
 * other file has no conversation.
 */
async function getDocumentConversation(
  auth: Authenticator,
  documentPath: string
): Promise<{
  conversation: ConversationResource;
  isPodDocument: boolean;
  location: string;
} | null> {
  const scope = parseScopedPrefix(documentPath);
  if (!scope) {
    return null;
  }

  switch (scope.kind) {
    case "conversation": {
      const conversation = await ConversationResource.fetchById(auth, scope.id);
      return conversation
        ? {
            conversation,
            isPodDocument: false,
            location: "this conversation's files",
          }
        : null;
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
      const location = `the pod "${pod.name}"`;
      if (existing) {
        return { conversation: existing, isPodDocument: true, location };
      }
      const conversation = await createConversation(auth, {
        title: `Comments · ${getFileNameFromScopedPath(documentPath)}`,
        visibility: "unlisted",
        spaceId: pod.id,
        metadata: { dfmDocumentPath: documentPath },
        notifyPodMembers: false,
      });
      return { conversation, isPodDocument: true, location };
    }
    case "conversation_metadata":
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

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * @cc [owner:tdraier,label:product] document-comment-message
 * The user message for a comment MUST open with `documentCommentMessageHeading`, which turns on
 * the `document_comments` skill, naming the thread's id, the document's path and where it lives,
 * then give the quoted passage when there is one and the new message as written. It MUST NOT
 * repeat the thread's earlier messages, which agents read in the document.
 */
function commentMessageContent(
  { documentPath, location }: { documentPath: string; location: string },
  { commentId, quote, message }: NewCommentMessage
): string {
  const parts = [
    documentCommentMessageHeading({ commentId, documentPath, location }),
  ];
  if (quote !== null) {
    parts.push(`> ${oneLine(quote)}`);
  }
  parts.push(message.body);
  return parts.join("\n\n");
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
 * A dispatched message MUST be posted as the saving user, as a user message with the
 * `document_comment` origin in the document's conversation carrying each mention once, so the
 * mentioned agent runs and mentioned users are notified as in a conversation. As in a
 * conversation, a message runs at most one agent: only the first agent mentioned is kept, and the
 * others are logged. It MUST be posted with `onlyWhenIdle`, and while an agent or a compaction runs in that conversation, or the document's
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
      const { conversation, isPodDocument, location } = found;

      const posted = await postUserMessage(auth, {
        conversationResource: conversation,
        content: commentMessageContent({ documentPath, location }, newMessage),
        mentions,
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
