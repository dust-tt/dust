import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { getNovuClient } from "@app/lib/notifications";
import { fireAndForgetNotification } from "@app/lib/notifications/fire_and_forget";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import type { NotificationCondition } from "@app/types/notification_preferences";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  CONVERSATION_UNREAD_TRIGGER_ID,
  DEFAULT_NOTIFICATION_CONDITION,
  isNotificationCondition,
} from "@app/types/notification_preferences";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const NOTIFICATION_DELAY_MS = 15_000; // 15 seconds

export const filterMembersByNotifyCondition = async (
  auth: Authenticator,
  members: UserResource[],
  spaceModelId: ModelId
): Promise<UserResource[]> => {
  const userModelIds = members.map((p) => p.id);

  // Bulk query for general and project-level preferences.
  const generalPreferences =
    await UserResource.fetchUserScopedMetadataValuesByUserModelIds(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
      userModelIds
    );

  const projectPreferenceMap =
    await UserProjectPreferencesResource.fetchNotificationPreferenceMap(auth, {
      spaceModelId,
      userModelIds,
    });

  const generalPreferenceMap = new Map<number, NotificationCondition>();
  for (const [userModelId, value] of generalPreferences) {
    if (isNotificationCondition(value)) {
      generalPreferenceMap.set(userModelId, value);
    }
  }

  return members.filter((member) => {
    // Project-level preference overrides the general one if present.
    const notifyCondition =
      projectPreferenceMap.get(member.id) ??
      generalPreferenceMap.get(member.id) ??
      DEFAULT_NOTIFICATION_CONDITION;
    switch (notifyCondition) {
      case "all_messages":
        return true;
      case "only_mentions":
        return false;
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
  if (!isPodConversation(conversation)) {
    return new Ok(undefined);
  }

  // Skip notification for conversations created from a todo.
  if (conversation.metadata?.projectTaskId) {
    return new Ok(undefined);
  }

  const userThatCreatedConversation = auth.user();

  // If no user context (e.g., API call without specific user), skip notification.
  if (!userThatCreatedConversation) {
    return new Ok(undefined);
  }

  // Wait before triggering the notification. This is useful to ensure that
  // the conversation has a title and its participants are fully created.
  await setTimeoutAsync(NOTIFICATION_DELAY_MS);

  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversation.sId,
    {
      excludeTest: true,
    }
  );

  // Conversation was deleted within the delay or conversation has visibility test
  if (!conversationResource) {
    return new Ok(undefined);
  }

  // Fetch all members of the project
  const space = await SpaceResource.fetchById(auth, conversation.spaceId);

  if (!space) {
    return new Err(new DustError("space_not_found", "Space not found"));
  }

  // Activation pods are nudged by the scheduler, not announced as a new project conversation.
  const activationPod = await ActivationPodResource.fetchBySpace(auth, space);
  if (activationPod !== null) {
    return new Ok(undefined);
  }

  const { allGroupMemberships } =
    await space.fetchManualGroupsMemberships(auth);

  const memberModelIds = [
    ...new Set(allGroupMemberships.map((membership) => membership.userId)),
  ];
  if (memberModelIds.length === 0) {
    return new Ok(undefined);
  }

  const projectMembers = await UserResource.fetchByModelIds(memberModelIds);
  const { memberships: workspaceMemberships } =
    await MembershipResource.getActiveMemberships({
      users: projectMembers,
      workspace: auth.getNonNullableWorkspace(),
    });
  const activeUserIds = new Set(
    workspaceMemberships.map((membership) => membership.userId)
  );
  const activeProjectMembers = projectMembers.filter((member) =>
    activeUserIds.has(member.id)
  );

  const otherProjectMembers = activeProjectMembers.filter(
    (member) => member.sId !== userThatCreatedConversation.sId
  );

  const usersToNotify = await filterMembersByNotifyCondition(
    auth,
    otherProjectMembers,
    space.id
  );

  if (usersToNotify.length === 0) {
    return new Ok(undefined);
  }

  try {
    const novuClient = await getNovuClient();

    const payload = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: conversation.sId,
      isNewProjectConversation: true,
      userThatCreatedConversationId: userThatCreatedConversation.sId,
    };

    const r = await novuClient.triggerBulk({
      events: usersToNotify.map((user) => ({
        workflowId: CONVERSATION_UNREAD_TRIGGER_ID,
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
  fireAndForgetNotification(
    triggerProjectNewConversationNotifications(auth, { conversation }),
    {
      message: "Failed to trigger project new conversation notification",
      context: { conversationId: conversation.sId },
    }
  );
}
