import type { NewCommentMessage } from "@app/lib/api/documents/comment_signatures";
import { parseScopedPrefix } from "@app/lib/api/file_system/dust_file_system";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import {
  extractFromString,
  replaceMentionsWithAt,
} from "@app/lib/mentions/format";
import { getActiveSubscriberAuth, getNovuClient } from "@app/lib/notifications";
import { filterParticipantsByNotifyCondition } from "@app/lib/notifications/triggers/conversation-unread";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute, getPodRoute } from "@app/lib/utils/router";
import { isUserMention } from "@app/types/assistant/mentions";
import {
  FILE_PREVIEW_SIDE_PANEL_TYPE,
  SIDE_PANEL_HASH_PARAM,
  SIDE_PANEL_TYPE_HASH_PARAM,
} from "@app/types/conversation_side_panel";
import { parseCanonicalScopedPath } from "@app/types/mount_path";
import { DOCUMENT_COMMENT_MENTION_TRIGGER_ID } from "@app/types/notification_preferences";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import { stripMarkdown } from "@app/types/shared/utils/markdown";
import z from "zod";

const MESSAGE_PREVIEW_LENGTH = 300;

export const DocumentCommentMentionPayloadSchema = z.object({
  workspaceId: z.string(),
  documentPath: z.string(),
  commentId: z.string(),
  authorId: z.string(),
  messagePreview: z.string(),
});

export type DocumentCommentMentionPayloadType = z.infer<
  typeof DocumentCommentMentionPayloadSchema
>;

interface ReadableDocument {
  locationName: string;
  route: string;
  spaceModelId: ModelId | null;
}

/**
 * @cc [owner:adrien,label:security;product] document-comment-mention-access
 * MUST return `null` unless the user of `auth` can read the document at `documentPath`: the pod
 * for a pod document, the conversation for a conversation document. Any other document is never
 * readable.
 */
export async function getReadableDocument(
  auth: Authenticator,
  documentPath: string
): Promise<ReadableDocument | null> {
  const scope = parseScopedPrefix(documentPath);
  if (!scope) {
    return null;
  }
  const workspaceId = auth.getNonNullableWorkspace().sId;

  switch (scope.kind) {
    case "pod": {
      const pod = await SpaceResource.fetchById(auth, scope.id);
      if (!pod || !auth.can("read", pod)) {
        return null;
      }
      const relPath = parseCanonicalScopedPath(documentPath)?.relPath ?? "";
      const folder = relPath.slice(0, Math.max(relPath.lastIndexOf("/"), 0));
      return {
        locationName: pod.name,
        route: getPodRoute(
          workspaceId,
          pod.sId,
          "files",
          folder ? `path=${encodeURIComponent(folder)}` : undefined
        ),
        spaceModelId: pod.id,
      };
    }
    case "conversation": {
      if (
        (await ConversationResource.canAccess(auth, scope.id)) !== "allowed"
      ) {
        return null;
      }
      const conversation = await ConversationResource.fetchById(auth, scope.id);
      if (!conversation) {
        return null;
      }
      const hash = new URLSearchParams({
        [SIDE_PANEL_TYPE_HASH_PARAM]: FILE_PREVIEW_SIDE_PANEL_TYPE,
        [SIDE_PANEL_HASH_PARAM]: documentPath,
      });
      return {
        locationName: conversation.title ?? "",
        route: `${getConversationRoute(workspaceId, conversation.sId)}#?${hash}`,
        spaceModelId: conversation.spaceId,
      };
    }
    case "conversation_metadata":
    case "user":
      return null;
    default:
      return assertNever(scope);
  }
}

function messagePreview(body: string): string {
  const text = stripMarkdown(replaceMentionsWithAt(body)).trim();
  return text.length > MESSAGE_PREVIEW_LENGTH
    ? `${text.substring(0, MESSAGE_PREVIEW_LENGTH)}...`
    : text;
}

/**
 * @cc [owner:adrien,label:product;security] document-comment-mention-notification
 * Each user mentioned in a new comment message MUST be notified once, except its author, users
 * who are not active members of the workspace, users who cannot read the document, and users whose
 * notify condition for the document's space is `never`.
 */
export async function triggerDocumentCommentMentionNotifications(
  auth: Authenticator,
  {
    documentPath,
    newMessage,
  }: { documentPath: string; newMessage: NewCommentMessage }
): Promise<Result<void, DustError<"internal_error">>> {
  const author = auth.user();
  if (!author) {
    return new Ok(undefined);
  }
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const mentionedUserIds = new Set(
    extractFromString(newMessage.message.body)
      .filter(isUserMention)
      .map((mention) => mention.userId)
      .filter((userId) => userId !== author.sId)
  );
  if (mentionedUserIds.size === 0) {
    return new Ok(undefined);
  }

  const readers = removeNulls(
    await concurrentExecutor(
      await UserResource.fetchByIds([...mentionedUserIds]),
      async (user) => {
        const userAuth = await getActiveSubscriberAuth(user.sId, workspaceId);
        const document = userAuth
          ? await getReadableDocument(userAuth, documentPath)
          : null;
        return document
          ? { user: { ...user.toJSON(), lastReadAt: null }, document }
          : null;
      },
      { concurrency: 4 }
    )
  );
  if (readers.length === 0) {
    return new Ok(undefined);
  }

  const recipients = await filterParticipantsByNotifyCondition({
    auth,
    participants: readers.map(({ user }) => user),
    mentionedUserIds,
    totalParticipantCount: readers.length,
    spaceModelId: readers[0].document.spaceModelId,
  });
  if (recipients.length === 0) {
    return new Ok(undefined);
  }

  const payload: DocumentCommentMentionPayloadType = {
    workspaceId,
    documentPath,
    commentId: newMessage.commentId,
    authorId: author.sId,
    messagePreview: messagePreview(newMessage.message.body),
  };

  try {
    const novuClient = await getNovuClient();
    const r = await novuClient.triggerBulk({
      events: recipients.map((user) => ({
        workflowId: DOCUMENT_COMMENT_MENTION_TRIGGER_ID,
        to: {
          subscriberId: user.sId,
          email: user.email,
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
        },
        payload,
      })),
    });

    if (r.result.some((event) => !!event.error?.length)) {
      const eventErrors = r.result
        .filter((res) => !!res.error?.length)
        .map(({ error }) => error?.join("; "))
        .join("; ");
      return new Err({
        name: "dust_error",
        code: "internal_error",
        message: `Failed to trigger document comment mention notification: ${eventErrors}`,
      });
    }
  } catch (err) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Failed to trigger document comment mention notification",
      cause: normalizeError(err),
    });
  }

  return new Ok(undefined);
}
