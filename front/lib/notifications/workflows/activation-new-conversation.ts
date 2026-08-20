import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { getNovuClient } from "@app/lib/notifications";
import { hasUnreadSucceededAgentReply } from "@app/lib/notifications/conversation_fetch";
import { renderEmail } from "@app/lib/notifications/email-templates/activation-new-conversation";
import {
  getActivationRecommendation,
  getConversationDetails,
} from "@app/lib/notifications/helpers";
import { shouldSkipConversationExternalNotification } from "@app/lib/notifications/workflows/conversation-unread";
import { ActivationRecommendationResource } from "@app/lib/resources/activation_recommendation_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { FOR_YOU_EMAIL_UTM } from "@app/lib/tracking/campaigns";
import { getGetStartedRoute } from "@app/lib/utils/router";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { ACTIVATION_NEW_CONVERSATION_TRIGGER_ID } from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workflow } from "@novu/framework";
import { z } from "zod";

// An unread activation conversation created through the activation nudge flow are sent
// to the target user as a dedicated, standalone email. It has no digest step, so a
// conversation sent this way is never also bundled into the unread digest for the same activity.

const ACTIVATION_NEW_CONVERSATION_EMAIL_SUBJECT_FALLBACK =
  "A recommendation for you";

export function getActivationNewConversationEmailSubject(
  recommendationName: string | null
): string {
  const normalizedName = recommendationName?.replace(/\s+/g, " ").trim();
  return `[Dust] Try this next: ${
    normalizedName || ACTIVATION_NEW_CONVERSATION_EMAIL_SUBJECT_FALLBACK
  }`;
}

const activationNewConversationPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
});

type activationNewConversationPayloadType = z.infer<
  typeof activationNewConversationPayloadSchema
>;

const activationNewConversationDetailsSchema = z.object({
  recommendationName: z.string().nullable(),
  actionLabel: z.string(),
  workspaceName: z.string(),
  podName: z.string(),
  goal: z.string().nullable(),
});

type activationNewConversationDetailsType = z.infer<
  typeof activationNewConversationDetailsSchema
>;

export const shouldSkipActivationNewConversation = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: activationNewConversationPayloadType;
}): Promise<boolean> => {
  if (!subscriberId) {
    return true;
  }

  if (await shouldSkipConversationExternalNotification(payload.workspaceId)) {
    return true;
  }

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    payload.workspaceId
  );

  // Send only when the agent has actually finished replying and that reply is still unread for this user.
  const hasUnreadAgentReply = await hasUnreadSucceededAgentReply(
    auth,
    payload.conversationId
  );

  return !hasUnreadAgentReply;
};

const getActivationNewConversationDetails = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: activationNewConversationPayloadType;
}): Promise<activationNewConversationDetailsType> => {
  const detailsResult = await getConversationDetails({
    subscriberId: subscriberId ?? "",
    payload: { ...payload, isNewProjectConversation: true },
  });
  if (detailsResult.isErr()) {
    // Only reached for a deleted conversation, in which case the email step is
    // already skipped, so this value is never actually delivered.
    return {
      recommendationName: null,
      actionLabel: "Start building",
      workspaceName: "your workspace",
      podName: "your pod",
      goal: null,
    };
  }

  const { goal } = await getActivationRecommendation({
    details: detailsResult.value,
    subscriberId: subscriberId ?? "",
    payload,
  });
  const recommendations = subscriberId
    ? await ActivationRecommendationResource.fetchByConversationSId(
        await Authenticator.fromUserIdAndWorkspaceId(
          subscriberId,
          payload.workspaceId
        ),
        payload.conversationId
      )
    : [];

  return {
    recommendationName:
      recommendations[0]?.title ?? detailsResult.value.subject,
    actionLabel: recommendations[0]?.ctaLabel?.trim() || "Start building",
    workspaceName: detailsResult.value.workspaceName,
    podName: detailsResult.value.projectName ?? "your pod",
    goal,
  };
};

export const activationNewConversationWorkflow = workflow(
  ACTIVATION_NEW_CONVERSATION_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    const details = await step.custom(
      "get-conversation-details",
      async () => {
        return getActivationNewConversationDetails({
          subscriberId: subscriber.subscriberId,
          payload,
        });
      },
      {
        outputSchema: activationNewConversationDetailsSchema,
      }
    );

    await step.email(
      "send-email",
      async () => {
        const forYouUrl = `${config.getAppUrl()}${getGetStartedRoute(payload.workspaceId)}?${new URLSearchParams(
          {
            ...FOR_YOU_EMAIL_UTM,
            utm_content: payload.conversationId,
          }
        ).toString()}`;

        const body = await renderEmail({
          name: subscriber.firstName ?? "You",
          workspace: {
            id: payload.workspaceId,
            name: details.workspaceName,
          },
          podName: details.podName,
          goal: details.goal,
          action: {
            label: details.actionLabel,
            url: forYouUrl,
          },
        });

        return {
          subject: getActivationNewConversationEmailSubject(
            details.recommendationName
          ),
          body,
        };
      },
      {
        skip: async () =>
          shouldSkipActivationNewConversation({
            subscriberId: subscriber.subscriberId,
            payload,
          }),
      }
    );
  },
  {
    payloadSchema: activationNewConversationPayloadSchema,
    tags: ["conversations"] as NotificationAllowedTags,
  }
);

export const triggerActivationNewConversationEmail = async (
  auth: Authenticator,
  {
    conversation,
    userToNotify,
  }: {
    conversation: ConversationWithoutContentType;
    userToNotify: UserResource;
  }
): Promise<Result<void, DustError<"internal_error">>> => {
  try {
    const novuClient = await getNovuClient();

    const payload: activationNewConversationPayloadType = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      conversationId: conversation.sId,
    };

    // A nudge conversation should produce exactly one email. Agent-loop
    // finalization and Temporal activities are both retryable, so use the
    // conversation and recipient as Novu's stable deduplication boundary.
    const transactionId = `${ACTIVATION_NEW_CONVERSATION_TRIGGER_ID}-${payload.workspaceId}-${payload.conversationId}-${userToNotify.sId}`;

    const r = await novuClient.triggerBulk({
      events: [
        {
          workflowId: ACTIVATION_NEW_CONVERSATION_TRIGGER_ID,
          transactionId,
          to: {
            subscriberId: userToNotify.sId,
            email: userToNotify.email,
            firstName: userToNotify.firstName ?? undefined,
            lastName: userToNotify.lastName ?? undefined,
          },
          payload,
        },
      ],
    });

    if (r.result.some((event) => !!event.error?.length)) {
      const eventErrors = r.result
        .filter((res) => !!res.error?.length)
        .map(({ error }) => error?.join("; "))
        .join("; ");
      return new Err({
        name: "dust_error",
        code: "internal_error",
        message: `Failed to trigger activation new conversation email: ${eventErrors}`,
      });
    }
  } catch (err) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Failed to trigger activation new conversation email",
      cause: normalizeError(err),
    });
  }

  return new Ok(undefined);
};
