import { workflow } from "@novu/framework";
import z from "zod";

import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { getNovuClient } from "@app/lib/notifications";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { getConversationRoute } from "@app/lib/utils/router";
import type { ConversationWithoutContentType, Result } from "@app/types";
import { Err } from "@app/types";
import { Ok } from "@app/types";

const ConversationAddedAsParticipantPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
  userThatAddedYouId: z.string(),
});

type ConversationAddedAsParticipantPayloadType = z.infer<
  typeof ConversationAddedAsParticipantPayloadSchema
>;

const CONVERSATION_ADDED_AS_PARTICIPANT_TRIGGER_ID =
  "conversation-added-as-participant";

const ConversationDetailsSchema = z.object({
  subject: z.string(),
  userThatAddedYouFullname: z.string(),
  workspaceName: z.string(),
});

type ConversationDetailsType = z.infer<typeof ConversationDetailsSchema>;

const getConversationDetails = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: ConversationAddedAsParticipantPayloadType;
}): Promise<ConversationDetailsType> => {
  let subject: string = "A dust conversation";
  let userThatAddedYouFullname: string = "Someone else";
  let workspaceName: string = "A workspace";

  if (subscriberId) {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );

    const conversation = await ConversationResource.fetchById(
      auth,
      payload.conversationId
    );

    if (conversation) {
      workspaceName = auth.getNonNullableWorkspace().name;
      subject = conversation.title ?? "Dust conversation";

      const userThatAddedYou = await UserResource.fetchById(
        payload.userThatAddedYouId
      );

      if (userThatAddedYou) {
        userThatAddedYouFullname = userThatAddedYou.fullName();
      }
    }
  }
  return {
    subject,
    userThatAddedYouFullname,
    workspaceName,
  };
};

const shouldSkipConversation = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: ConversationAddedAsParticipantPayloadType;
}): Promise<boolean> => {
  if (subscriberId) {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );

    const conversation = await ConversationResource.fetchById(
      auth,
      payload.conversationId
    );

    if (!conversation) {
      return true;
    }
  }

  return false;
};

export const conversationAddedAsParticipantWorkflow = workflow(
  CONVERSATION_ADDED_AS_PARTICIPANT_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    const details = await step.custom(
      "get-conversation-details",
      async () => {
        return getConversationDetails({
          subscriberId: subscriber.subscriberId,
          payload,
        });
      },
      {
        outputSchema: ConversationDetailsSchema,
      }
    );

    await step.inApp(
      "send-in-app",
      async () => {
        return {
          subject: details.subject,
          body: `${details.userThatAddedYouFullname} added you to the conversation.`,
          primaryAction: {
            label: "View",
            redirect: {
              url: getConversationRoute(
                payload.workspaceId,
                payload.conversationId
              ),
            },
          },
          data: {
            // This custom flag means that the in-app message should be deleted automatically after it is received (we don't want to clutter the user's inbox).
            autoDelete: true,
            conversationId: payload.conversationId,
          },
        };
      },
      {
        skip: async () => shouldSkipConversation({ payload }),
      }
    );

    await step.email(
      "send-email",
      async () => {
        const body = await renderEmail({
          name: subscriber.firstName ?? "You",
          workspace: {
            id: payload.workspaceId,
            name: details.workspaceName,
          },
          content: `${details.userThatAddedYouFullname} added you to the conversation "${details.subject}".`,
          action: {
            label: "View conversation",
            url:
              process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL +
              getConversationRoute(payload.workspaceId, payload.conversationId),
          },
        });
        return {
          subject: `[Dust] You were mentioned in a conversation`,
          body,
        };
      },
      {
        // No email from trigger until we give more control over the notification to the users.
        skip: async () => {
          return shouldSkipConversation({ payload });
        },
      }
    );
  },
  {
    payloadSchema: ConversationAddedAsParticipantPayloadSchema,
    tags: ["conversations"] as NotificationAllowedTags,
  }
);

export const triggerConversationAddedAsParticipantNotification = async (
  auth: Authenticator,
  {
    conversation,
    addedUserId,
  }: {
    conversation: ConversationWithoutContentType;
    addedUserId: string;
  }
): Promise<Result<void, DustError<"internal_error">>> => {
  // Skip any sub-conversations.
  if (conversation.depth > 0) {
    return new Ok(undefined);
  }

  const userThatAddedYou = auth.user();

  // Message could be created via the API without a specific user.
  if (!userThatAddedYou) {
    return new Ok(undefined);
  }

  const addedUser = await UserResource.fetchById(addedUserId);
  if (!addedUser) {
    return new Err(new DustError("internal_error", "User not found"));
  }

  try {
    const novuClient = await getNovuClient();

    const payload: ConversationAddedAsParticipantPayloadType = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: conversation.sId,
      userThatAddedYouId: userThatAddedYou.sId,
    };
    const r = await novuClient.trigger(
      CONVERSATION_ADDED_AS_PARTICIPANT_TRIGGER_ID,
      {
        to: {
          subscriberId: addedUserId,
          email: addedUser.email,
          firstName: addedUser.firstName ?? undefined,
          lastName: addedUser.lastName ?? undefined,
        },
        payload,
      }
    );
    if (r.status <= 200 && r.status >= 300) {
      return new Err({
        name: "dust_error",
        code: "internal_error",
        message:
          "Failed to trigger conversation added as participant notification",
        cause: r.statusText,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message:
        "Failed to trigger conversation added as participant notification",
    });
  }

  return new Ok(undefined);
};
