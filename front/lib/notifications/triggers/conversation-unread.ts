import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { getActiveSubscriberAuth, getNovuClient } from "@app/lib/notifications";
import type { ConversationDetailsPayload } from "@app/lib/notifications/helpers";
import { getConversationDetails } from "@app/lib/notifications/helpers";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
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
import type { UserType } from "@app/types/user";
import { areConversationExternalNotificationsEnabled } from "@app/types/user";

// The unread workflow operates on the shared conversation-details payload.
export type ConversationUnreadPayloadType = ConversationDetailsPayload;

export async function shouldSkipConversationExternalNotification(
  workspaceId: string
): Promise<boolean> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    return true;
  }
  return !areConversationExternalNotificationsEnabled(
    renderLightWorkspaceType({ workspace })
  );
}

export const shouldSendNotificationForAgentAnswer = (
  userMessageOrigin?: UserMessageOrigin | null
): boolean => {
  switch (userMessageOrigin) {
    case "web":
    case "extension":
    case "cli":
    case "cli_programmatic":
    case "document_comment":
    case "wakeup":
      return true;
    case "onboarding_conversation":
    case "agent_sidekick":
    case "analytics_panel":
    case "reinforced_skill_notification":
    case "reinforcement":
    case "system_activation":
      // Internal bootstrap conversations shouldn't trigger unread notifications.
      return false;
    case "api":
    case "email":
    case "excel":
    case "gsheet":
    case "make":
    case "n8n":
    case "powerpoint":
    case "raycast":
    case "slack":
    case "slack_workflow":
    case "teams":
    case "transcript":
    case "triggered_programmatic":
    case "triggered":
    case "zapier":
    case "zendesk":
    case "project_kickoff":
    case undefined:
    case null:
      return false;
    default:
      assertNever(userMessageOrigin);
  }
};

const shouldSkipUnreadConversation = async ({
  subscriberId,
  payload,
  triggerShouldSkip,
  hasUnreadMessages,
}: {
  subscriberId: string;
  payload: ConversationUnreadPayloadType;
  triggerShouldSkip: boolean;
  hasUnreadMessages: boolean;
}): Promise<boolean> => {
  const auth = await getActiveSubscriberAuth(subscriberId, payload.workspaceId);
  if (!auth) {
    return true;
  }

  const conversation = await ConversationResource.fetchById(
    auth,
    payload.conversationId
  );

  if (!conversation) {
    return true;
  }

  if (triggerShouldSkip && conversation.triggerSId) {
    return true;
  }

  const { actionRequired, lastReadAt } =
    await ConversationResource.getActionRequiredAndLastReadAtForUser(
      auth,
      conversation.id
    );

  const unread =
    (lastReadAt === null || conversation.updatedAt > lastReadAt) &&
    hasUnreadMessages;

  if (!actionRequired && !unread) {
    return true;
  }

  return false;
};

export const shouldSkipNewProjectConversation = async ({
  subscriberId,
  payload,
}: {
  subscriberId: string;
  payload: ConversationUnreadPayloadType;
}): Promise<boolean> => {
  const auth = await getActiveSubscriberAuth(subscriberId, payload.workspaceId);
  if (!auth) {
    return true;
  }

  const conversationResource = await ConversationResource.fetchById(
    auth,
    payload.conversationId
  );

  if (!conversationResource) {
    return true;
  }

  const { lastReadAt } =
    await ConversationResource.getActionRequiredAndLastReadAtForUser(
      auth,
      conversationResource.id
    );

  const hasBeenOpened = !!lastReadAt;

  if (hasBeenOpened) {
    return true;
  }

  const conversationParticipants =
    await conversationResource.listParticipants(auth);

  const isConversationParticipant = conversationParticipants.some(
    (participant) => participant.sId === subscriberId
  );

  if (isConversationParticipant) {
    return true;
  }

  const conversation = conversationResource.toJSON();

  if (!isPodConversation(conversation)) {
    return true;
  }

  const project = await SpaceResource.fetchById(auth, conversation.spaceId);

  if (!project) {
    return true;
  }

  if (!project.isMember(auth)) {
    return true;
  }

  return false;
};

export const shouldSkipConversation = async ({
  subscriberId,
  payload,
  triggerShouldSkip,
  hasUnreadMessages,
}: {
  subscriberId?: string | null;
  payload: ConversationUnreadPayloadType;
  triggerShouldSkip: boolean;
  hasUnreadMessages: boolean;
}): Promise<boolean> => {
  if (!subscriberId) {
    return true;
  }

  if (payload.isNewProjectConversation) {
    return shouldSkipNewProjectConversation({ subscriberId, payload });
  }

  return shouldSkipUnreadConversation({
    subscriberId,
    payload,
    triggerShouldSkip,
    hasUnreadMessages,
  });
};

/**
 * Filters participants based on their notification condition preference.
 * Returns only participants who should receive notifications.
 * Note: If a user is the only human participant in the conversation, they are
 * always notified regardless of their preference.
 */
export const filterParticipantsByNotifyCondition = async ({
  auth,
  participants,
  mentionedUserIds,
  totalParticipantCount,
  spaceModelId,
}: {
  auth: Authenticator;
  participants: (UserType & { lastReadAt: Date | null })[];
  mentionedUserIds: Set<string>;
  totalParticipantCount: number;
  spaceModelId: ModelId | null;
}): Promise<(UserType & { lastReadAt: Date | null })[]> => {
  const userModelIds = participants.map((p) => p.id);

  const generalPreferences =
    await UserResource.fetchUserScopedMetadataValuesByUserModelIds(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
      userModelIds
    );

  const generalPreferenceMap = new Map<number, NotificationCondition>();
  for (const [userModelId, value] of generalPreferences) {
    if (isNotificationCondition(value)) {
      generalPreferenceMap.set(userModelId, value);
    }
  }

  const projectPreferenceMap = spaceModelId
    ? await UserProjectPreferencesResource.fetchNotificationPreferenceMap(
        auth,
        {
          spaceModelId,
          userModelIds,
        }
      )
    : new Map<ModelId, NotificationCondition>();

  return participants.filter((participant) => {
    // Project-level preference overrides the general one if present.
    const notifyCondition =
      projectPreferenceMap.get(participant.id) ??
      generalPreferenceMap.get(participant.id) ??
      DEFAULT_NOTIFICATION_CONDITION;
    switch (notifyCondition) {
      case "all_messages":
        return true;
      case "only_mentions":
        // Notify if mentioned OR if only human participant.
        return (
          mentionedUserIds.has(participant.sId) || totalParticipantCount === 1
        );
      case "never":
        return false;
    }
  });
};

export const triggerConversationUnreadNotifications = async (
  auth: Authenticator,
  {
    conversationId,
    messageId,
    userToNotifyId,
  }: {
    conversationId: string;
    messageId: string;
    userToNotifyId?: string; // Optional override for which user to notify, used in edge cases like adding a conversation participant.
  }
): Promise<
  Result<
    void,
    Omit<DustError, "code"> & {
      code: "internal_server_error";
    }
  >
> => {
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversation) {
    return new Ok(undefined);
  }
  // Skip any sub-conversations.
  if (conversation.depth > 0) {
    return new Ok(undefined);
  }

  // Get conversation details including mentioned user IDs.
  const detailsResult = await getConversationDetails({
    auth,
    payload: {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: conversation.sId,
      messageId,
    },
  });
  if (detailsResult.isErr()) {
    // Conversation or message was deleted - no notification needed.
    return new Ok(undefined);
  }
  if (
    detailsResult.value.isFromEmailAgentConversation ||
    detailsResult.value.isFromSlackAgentConversation
  ) {
    return new Ok(undefined);
  }
  const { authorUserId } = detailsResult.value;
  // Get all participants to determine total count (for single-participant exception).
  const totalParticipants = await conversation.listParticipants(auth, {
    onlyActiveMembers: true,
  });
  const allParticipants = totalParticipants.filter((p) => {
    if (userToNotifyId && p.sId !== userToNotifyId) {
      return false;
    }
    // Exclude the message author from notifications (they don't need to be
    // notified about their own message).
    if (authorUserId && p.sId === authorUserId) {
      return false;
    }
    return p.lastReadAt === null || conversation.updatedAt > p.lastReadAt;
  });

  if (allParticipants.length === 0) {
    return new Ok(undefined);
  }

  // Filter participants based on their notification condition preference.
  const participants = await filterParticipantsByNotifyCondition({
    auth,
    participants: allParticipants,
    mentionedUserIds: new Set(detailsResult.value.mentionedUserIds),
    totalParticipantCount: totalParticipants.length,
    spaceModelId: conversation.spaceId,
  });

  if (participants.length === 0) {
    return new Ok(undefined);
  }

  try {
    const novuClient = await getNovuClient();

    const r = await novuClient.triggerBulk({
      events: participants.map((p) => {
        const payload: ConversationUnreadPayloadType = {
          conversationId: conversation.sId,
          workspaceId: auth.getNonNullableWorkspace().sId,
          messageId,
        };
        return {
          workflowId: CONVERSATION_UNREAD_TRIGGER_ID,
          to: {
            subscriberId: p.sId,
            email: p.email,
            firstName: p.firstName ?? undefined,
            lastName: p.lastName ?? undefined,
          },
          payload,
        };
      }),
    });

    if (r.result.some((event) => !!event.error?.length)) {
      const eventErrors = r.result
        .filter((res) => !!res.error?.length)
        .map(({ error }) => error?.join("; "))
        .join("; ");
      return new Err({
        name: "dust_error",
        code: "internal_server_error",
        message: `Failed to trigger conversation unread notification due to network errors: ${eventErrors}`,
      });
    }
    return new Ok(undefined);
  } catch (error) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Failed to trigger conversation unread notification: ${normalizeError(error).message}`,
    });
  }
};
