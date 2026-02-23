import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { getNovuClient } from "@app/lib/notifications";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserMetadataModel } from "@app/lib/resources/storage/models/user";
import type { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isProjectConversation } from "@app/types/assistant/conversation";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  DEFAULT_PROJECT_NEW_CONVERSATION_NOTIFICATION_CONDITION,
  isProjectNewConversationNotificationConditionOptions,
  PROJECT_NEW_CONVERSATION_TRIGGER_ID,
  type ProjectNewConversationNotificationConditionOptions,
} from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import uniqBy from "lodash/uniqBy";
import { Op } from "sequelize";
import z from "zod";

export const projectNewConversationPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
  userThatCreatedConversationId: z.string(),
});

export type ProjectNewConversationPayloadType = z.infer<
  typeof projectNewConversationPayloadSchema
>;

const NOTIFICATION_DELAY_MS = 15_000; // 15 seconds

export const filterMembersByNotifyCondition = async (
  members: UserResource[]
): Promise<UserResource[]> => {
  const userModelIds = members.map((p) => p.id);

  // Bulk query for all preferences.
  const preferences = await UserMetadataModel.findAll({
    where: {
      userId: { [Op.in]: userModelIds },
      key: CONVERSATION_NOTIFICATION_METADATA_KEYS.projectNewConversationNotifyCondition,
    },
    attributes: ["userId", "value"],
  });

  const preferenceMap = new Map<
    number,
    ProjectNewConversationNotificationConditionOptions
  >();
  for (const pref of preferences) {
    if (isProjectNewConversationNotificationConditionOptions(pref.value)) {
      preferenceMap.set(pref.userId, pref.value);
    }
  }

  return members.filter((member) => {
    const notifyCondition =
      preferenceMap.get(member.id) ??
      DEFAULT_PROJECT_NEW_CONVERSATION_NOTIFICATION_CONDITION;
    switch (notifyCondition) {
      case "all_projects":
        return true;
      case "never":
        return false;
      default:
        assertNever(notifyCondition);
    }
  });
};

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

  // Wait before triggering the notification. This is useful to ensure that
  // the conversation has a title and its participants are fully created.
  await new Promise((resolve) => setTimeout(resolve, NOTIFICATION_DELAY_MS));

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

  const otherProjectMembers = projectMembers.filter(
    (member) => member.sId !== userThatCreatedConversation.sId
  );

  const usersToNotify =
    await filterMembersByNotifyCondition(otherProjectMembers);

  if (usersToNotify.length === 0) {
    return new Ok(undefined);
  }

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
