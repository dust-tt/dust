import { checkCollabReadAccess } from "@app/lib/api/collab/access";
import type { NewCommentMessage } from "@app/lib/api/documents/comment_signatures";
import { parseScopedPrefix } from "@app/lib/api/file_system/dust_file_system";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { getFileNameFromScopedPath } from "@app/lib/markdown/file_preview";
import { extractFromString } from "@app/lib/mentions/format";
import {
  filterUsersByNotifyCondition,
  getActiveSubscriberAuth,
  getNovuClient,
} from "@app/lib/notifications";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute, getPodRoute } from "@app/lib/utils/router";
import { makeDocumentCommentMentionWorkflowId } from "@app/temporal/mentions_queue/helpers";
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
import z from "zod";

export const DocumentCommentMentionPayloadSchema = z.object({
  workspaceId: z.string(),
  documentPath: z.string(),
  commentId: z.string(),
  authorName: z.string(),
  fileName: z.string(),
  route: z.string(),
});

export type DocumentCommentMentionPayloadType = z.infer<
  typeof DocumentCommentMentionPayloadSchema
>;

interface DocumentRouteAndSpace {
  route: string;
  spaceModelId: ModelId | null;
}

/**
 * @cc [owner:adrien,label:product] document-comment-mention-route
 * MUST return the route that opens the document at `documentPath` and the model id of its space,
 * or `null` when it is neither a pod nor a conversation document. It MUST NOT decide any
 * recipient's access, which `checkCollabReadAccess` does.
 */
export async function getDocumentRouteAndSpace(
  auth: Authenticator,
  documentPath: string
): Promise<DocumentRouteAndSpace | null> {
  const scope = parseScopedPrefix(documentPath);
  if (!scope) {
    return null;
  }
  const workspaceId = auth.getNonNullableWorkspace().sId;

  switch (scope.kind) {
    case "pod": {
      const pod = await SpaceResource.fetchById(auth, scope.id);
      if (!pod) {
        return null;
      }
      const relPath = parseCanonicalScopedPath(documentPath)?.relPath ?? "";
      const folder = relPath.slice(0, Math.max(relPath.lastIndexOf("/"), 0));
      return {
        route: getPodRoute(
          workspaceId,
          scope.id,
          "files",
          folder ? `path=${encodeURIComponent(folder)}` : undefined
        ),
        spaceModelId: pod.id,
      };
    }
    case "conversation": {
      const conversation = await ConversationResource.fetchById(auth, scope.id);
      if (!conversation) {
        return null;
      }
      const hash = new URLSearchParams({
        [SIDE_PANEL_TYPE_HASH_PARAM]: FILE_PREVIEW_SIDE_PANEL_TYPE,
        [SIDE_PANEL_HASH_PARAM]: documentPath,
      });
      return {
        route: `${getConversationRoute(workspaceId, scope.id)}#?${hash}`,
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

/**
 * @cc [owner:adrien,label:product;security] document-comment-mention-notification
 * Each user mentioned in a new comment message MUST be notified once, except its author, users
 * who are not active members of the workspace, users `checkCollabReadAccess` refuses the document
 * to, and users whose
 * notify condition for the document's space is `never`. The payload MUST carry the document's
 * route and file name, and the author's name, so the immediate channels send without checking
 * access again.
 */
/**
 * @cc [owner:adrien,label:product;performance] document-comment-mention-idempotent
 * Each recipient's event MUST carry a `transactionId` that depends only on the workspace, the
 * document, the comment message and the recipient, so a retried trigger never notifies a
 * recipient twice.
 */
export async function triggerDocumentCommentMentionNotifications(
  auth: Authenticator,
  {
    documentPath,
    newMessage,
  }: { documentPath: string; newMessage: NewCommentMessage }
): Promise<Result<void, DustError<"internal_error">>> {
  const author = auth.getNonNullableUser();
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

  const document = await getDocumentRouteAndSpace(auth, documentPath);
  if (!document) {
    return new Ok(undefined);
  }

  const subscribers = await filterUsersByNotifyCondition(auth, {
    users: await UserResource.fetchByIds([...mentionedUserIds]),
    spaceModelId: document.spaceModelId,
    shouldNotify: (_user, notifyCondition) => notifyCondition !== "never",
  });
  const recipients = removeNulls(
    await concurrentExecutor(
      subscribers,
      async (user) => {
        const userAuth = await getActiveSubscriberAuth(user.sId, workspaceId);
        return userAuth &&
          (await checkCollabReadAccess(userAuth, documentPath)).isOk()
          ? user
          : null;
      },
      { concurrency: 4 }
    )
  );
  if (recipients.length === 0) {
    return new Ok(undefined);
  }

  const payload: DocumentCommentMentionPayloadType = {
    workspaceId,
    documentPath,
    commentId: newMessage.commentId,
    authorName: author.fullName(),
    fileName: getFileNameFromScopedPath(documentPath),
    route: document.route,
  };
  const transactionIdPrefix = makeDocumentCommentMentionWorkflowId({
    workspaceId,
    documentPath,
    newMessage,
  });

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
        transactionId: `${transactionIdPrefix}-${user.sId}`,
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
