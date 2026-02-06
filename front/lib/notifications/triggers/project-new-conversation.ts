import uniqBy from "lodash/uniqBy";
import z from "zod";

import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { getNovuClient } from "@app/lib/notifications";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType, Result } from "@app/types";
import { Err, isProjectConversation, normalizeError, Ok } from "@app/types";
import { PROJECT_NEW_CONVERSATION_TRIGGER_ID } from "@app/types/notification_preferences";

export const projectNewConversationPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
  userThatCreatedConversationId: z.string(),
});

export type ProjectNewConversationPayloadType = z.infer<
  typeof projectNewConversationPayloadSchema
>;

/**
 * Trigger notifications for users added to a project.
 */
const triggerProjectNewConversationNotifications = async (
  auth: Authenticator,
  {
    conversation,
  }: {
    conversation: ConversationWithoutContentType;
  }
): Promise<Result<void, DustError<"internal_error" | "space_not_found">>> => {
  // Only notify for project conversations.
  if (!isProjectConversation(conversation)) {
    return new Ok(undefined);
  }

  const userThatCreatedConversation = auth.user();

  // If no user context (e.g., API call without specific user), skip notification.
  if (!userThatCreatedConversation) {
    return new Ok(undefined);
  }

  // Fetch all members of the project
  const space = await SpaceResource.fetchById(auth, conversation.spaceId);

  if (!space) {
    return new Err(new DustError("space_not_found", "Space not found"));
  }

  const { groupsToProcess } = await space.fetchManualGroupsMemberships(auth);

  const projectMembers = uniqBy(
    (
      await concurrentExecutor(
        groupsToProcess,
        async (group) => {
          return group.getActiveMembers(auth);
        },
        { concurrency: 8 }
      )
    ).flat(),
    "sId"
  );

  const usersToNotify = projectMembers.filter(
    (member) => member.sId !== userThatCreatedConversation.sId
  );

  try {
    const novuClient = await getNovuClient();

    const payload: ProjectNewConversationPayloadType = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: conversation.sId,
      userThatCreatedConversationId: userThatCreatedConversation.sId,
    };

    const r = await novuClient.triggerBulk({
      events: usersToNotify.map((user) => ({
        workflowId: PROJECT_NEW_CONVERSATION_TRIGGER_ID,
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
        message: `Failed to trigger project new conversation notification: ${eventErrors}`,
      });
    }
  } catch (err) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Failed to trigger project new conversation notification",
      cause: normalizeError(err),
    });
  }

  return new Ok(undefined);
};

/**
 * Fire-and-forget helper to trigger project new conversation notifications.
 * The notification is sent asynchronously and errors are logged but don't block the caller.
 */
export function notifyNewProjectConversation(
  auth: Authenticator,
  {
    conversation,
  }: {
    conversation: ConversationWithoutContentType;
  }
): void {
  void triggerProjectNewConversationNotifications(auth, {
    conversation,
  }).then((notifRes) => {
    if (notifRes.isErr()) {
      logger.error(
        { error: notifRes.error, conversationId: conversation.sId },
        "Failed to trigger project new conversation notification"
      );
    }
  });
}
