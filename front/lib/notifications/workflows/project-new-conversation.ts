import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import {
  getAgentsDataRetention,
  getConversationsDataRetention,
} from "@app/lib/data_retention";
import { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import {
  ensureSlackNotificationsReady,
  getUserNotificationDelay,
} from "@app/lib/notifications";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute } from "@app/lib/utils/router";
import { isProjectConversation } from "@app/types/assistant/conversation";
import {
  DEFAULT_NOTIFICATION_DELAY,
  NOTIFICATION_DELAY_OPTIONS,
  NOTIFICATION_PREFERENCES_DELAYS,
  PROJECT_NEW_CONVERSATION_TRIGGER_ID,
} from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pluralize, stripMarkdown } from "@app/types/shared/utils/string_utils";
import { workflow } from "@novu/framework";
import uniqBy from "lodash/uniqBy";
import z from "zod";
import { renderEmail } from "../email-templates/project-new-conversation";
import type { ProjectNewConversationPayloadType } from "../triggers/project-new-conversation";
import { projectNewConversationPayloadSchema } from "../triggers/project-new-conversation";

const ConversationDetailsSchema = z.object({
  projectName: z.string(),
  userThatCreatedConversationFullName: z.string(),
  conversationTitle: z.string(),
  hasConversationRetentionPolicy: z.boolean(),
  hasAgentRetentionPolicies: z.boolean(),
  firstMessageContent: z.string().nullable(),
});

const ConversationDetailsResultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    data: ConversationDetailsSchema,
  }),
  z.object({
    success: z.literal(false),
  }),
]);

const UserNotificationDelaySchema = z.object({
  delay: z.enum(NOTIFICATION_DELAY_OPTIONS),
});

export type ProjectDetailsType = z.infer<typeof ConversationDetailsSchema>;

const getConversationDetails = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: ProjectNewConversationPayloadType;
}): Promise<
  Result<
    ProjectDetailsType,
    DustError<
      | "conversation_not_found"
      | "invalid_conversation"
      | "space_not_found"
      | "user_not_found"
    >
  >
> => {
  if (!subscriberId) {
    return new Ok({
      projectName: "A project",
      userThatCreatedConversationFullName: "Someone",
      conversationTitle: "New conversation",
      hasAgentRetentionPolicies: false,
      hasConversationRetentionPolicy: false,
      firstMessageContent: null,
    });
  }

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    payload.workspaceId
  );

  const conversationRes = await getConversation(auth, payload.conversationId);

  if (conversationRes.isErr()) {
    return new Err(
      new DustError("conversation_not_found", "Conversation not found")
    );
  }

  const conversation = conversationRes.value;

  if (!isProjectConversation(conversation)) {
    return new Err(
      new DustError(
        "invalid_conversation",
        "This conversation is not a project conversation"
      )
    );
  }

  const project = await SpaceResource.fetchById(auth, conversation.spaceId);

  if (!project) {
    return new Err(new DustError("space_not_found", "Project not found"));
  }

  const userThatCreatedConversation = await UserResource.fetchById(
    payload.userThatCreatedConversationId
  );

  if (!userThatCreatedConversation) {
    return new Err(
      new DustError(
        "user_not_found",
        "User that created conversation not found"
      )
    );
  }

  const conversationsRetention = await getConversationsDataRetention(auth);
  const hasConversationRetentionPolicy = conversationsRetention !== null;

  const agentsRetention = await getAgentsDataRetention(auth);
  const hasAgentRetentionPolicies = conversation.content.flat().some((msg) => {
    if (msg.type !== "agent_message") {
      return false;
    }

    return msg.configuration.sId in agentsRetention;
  });

  const firstMessageContent =
    conversation.content[0]?.[0].type === "user_message"
      ? conversation.content[0][0].content
      : null;

  return new Ok({
    projectName: project.name,
    userThatCreatedConversationFullName: userThatCreatedConversation.fullName(),
    conversationTitle: conversation.title ?? "New conversation",
    hasConversationRetentionPolicy,
    hasAgentRetentionPolicies,
    firstMessageContent,
  });
};

export const shouldSkipConversation = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: ProjectNewConversationPayloadType;
}): Promise<boolean> => {
  if (!subscriberId) {
    return true;
  }
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    payload.workspaceId
  );

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

  if (!isProjectConversation(conversation)) {
    return true;
  }

  const project = await SpaceResource.fetchById(auth, conversation.spaceId);

  if (!project) {
    return true;
  }

  const isProjectMember = project.isMember(auth);

  if (!isProjectMember) {
    return true;
  }

  return false;
};

export const getMessagePreviewText = (
  details: ProjectDetailsType
): string | undefined => {
  if (details.hasConversationRetentionPolicy) {
    return "Preview not available due to data retention policy on conversations in this workspace.";
  }
  if (details.hasAgentRetentionPolicies) {
    return "Preview not available due to data retention policy on agents in this conversation.";
  }
  if (details.firstMessageContent) {
    const stripped = stripMarkdown(details.firstMessageContent);
    const trimmed = stripped.trim();
    return trimmed.substring(0, 300) + (trimmed.length > 300 ? "..." : "");
  }
};

export const getMessagePreviewForSlack = (
  details: ProjectDetailsType
): string | undefined => {
  const preview = getMessagePreviewText(details);
  if (!preview) {
    return undefined;
  }
  // Replace newlines with "> \n" to maintain blockquote formatting on each line
  return preview
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
};

export const projectNewConversationWorkflow = workflow(
  PROJECT_NEW_CONVERSATION_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    const detailsResult = await step.custom(
      "get-project-details",
      async () => {
        const details = await getConversationDetails({
          subscriberId: subscriber.subscriberId,
          payload,
        });
        if (details.isErr()) {
          switch (details.error.code) {
            case "conversation_not_found":
            case "invalid_conversation":
            case "space_not_found":
            case "user_not_found":
              return { success: false as const };
            default:
              assertNever(details.error.code);
          }
        }
        return { success: true, data: details.value };
      },
      {
        outputSchema: ConversationDetailsResultSchema,
      }
    );

    const details = detailsResult.success ? detailsResult.data : null;

    await step.inApp(
      "send-in-app",
      async () => {
        // Details is guaranteed non-null because the step is skipped otherwise
        if (!details) {
          return {
            body: "",
          };
        }
        return {
          subject: `New conversation in ${details.projectName}`,
          body: `${details.userThatCreatedConversationFullName} created "${details.conversationTitle}"`,
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
            autoDelete: true,
            conversationId: payload.conversationId,
          },
        };
      },
      {
        skip: async () => {
          if (!details) {
            return true;
          }
          return shouldSkipConversation({
            subscriberId: subscriber.subscriberId,
            payload,
          });
        },
      }
    );

    await step.chat(
      "slack-notification",
      async () => {
        // details is guaranteed non-null here because skip prevents execution otherwise.
        const d = details!;
        const conversationUrl = getConversationRoute(
          payload.workspaceId,
          payload.conversationId,
          undefined,
          config.getAppUrl()
        );

        // Create message preview
        const messagePreview = getMessagePreviewForSlack(d);

        const baseMessage = `There is a new conversation in "${d.projectName}": ${d.userThatCreatedConversationFullName} started "${d.conversationTitle}"`;

        const message = messagePreview
          ? `${baseMessage}\n${messagePreview}\n<${conversationUrl}|View conversation>`
          : `${baseMessage}\n<${conversationUrl}|View conversation>`;
        return {
          body: message,
        };
      },
      {
        skip: async () => {
          if (!details) {
            return true;
          }
          const shouldSkip = await shouldSkipConversation({
            subscriberId: subscriber.subscriberId,
            payload,
          });
          if (shouldSkip) {
            return true;
          }
          const { isReady } = await ensureSlackNotificationsReady(
            subscriber.subscriberId,
            payload.workspaceId
          );
          if (!isReady) {
            return true;
          }
          return false;
        },
      }
    );

    const userNotificationDelayStep = await step.custom(
      "get-user-notification-delay",
      async () => {
        const userNotificationDelay = await getUserNotificationDelay({
          subscriberId: subscriber.subscriberId,
          workspaceId: payload.workspaceId,
          channel: "email",
          workflowTriggerId: PROJECT_NEW_CONVERSATION_TRIGGER_ID,
        });
        return { delay: userNotificationDelay };
      },
      {
        outputSchema: UserNotificationDelaySchema,
        skip: async () => {
          if (!details) {
            return true;
          }
          return shouldSkipConversation({
            subscriberId: subscriber.subscriberId,
            payload,
          });
        },
      }
    );

    const { events } = await step.digest(
      "digest",
      async () => {
        const digestKey = `workspace-${payload.workspaceId}-project-new-conversation`;
        const userPreferences =
          userNotificationDelayStep.delay ?? DEFAULT_NOTIFICATION_DELAY;
        return {
          ...NOTIFICATION_PREFERENCES_DELAYS[userPreferences],
          digestKey,
        };
      },
      {
        skip: async () => {
          if (!details) {
            return true;
          }
          // NOTE: We only check `details` here because `subscriber.subscriberId` is null
          // when the digest step's skip condition is evaluated (Novu framework bug).
          // All subscriber-based filtering (shouldSkipConversation) is handled in the
          // email step below, where subscriber context is properly available.
          return false;
        },
      }
    );

    await step.email(
      "send-email",
      async () => {
        const workspace = await WorkspaceResource.fetchById(
          payload.workspaceId
        );

        const conversations: Parameters<
          typeof renderEmail
        >[0]["conversations"] = [];

        const uniqEventsPerConversation = uniqBy(
          events,
          (event) => event.payload.conversationId
        );

        await concurrentExecutor(
          uniqEventsPerConversation,
          async (event) => {
            const eventPayload =
              event.payload as ProjectNewConversationPayloadType;
            const conversationDetailsResult = await getConversationDetails({
              subscriberId: subscriber.subscriberId,
              payload: eventPayload,
            });
            if (conversationDetailsResult.isErr()) {
              switch (conversationDetailsResult.error.code) {
                case "conversation_not_found":
                case "invalid_conversation":
                case "space_not_found":
                case "user_not_found":
                  return;
                default:
                  assertNever(conversationDetailsResult.error.code);
              }
            }
            const conversationDetails = conversationDetailsResult.value;
            conversations.push({
              id: eventPayload.conversationId,
              title: conversationDetails.conversationTitle,
              projectName: conversationDetails.projectName,
              createdByFullName:
                conversationDetails.userThatCreatedConversationFullName,
              messagePreview: getMessagePreviewText(conversationDetails),
            });
          },
          {
            concurrency: 8,
          }
        );
        const uniqueProjectNames = uniqBy(
          conversations,
          (conversation) => conversation.projectName
        ).map((conversation) => conversation.projectName);

        const body = await renderEmail({
          name: subscriber.firstName ?? "You",
          workspace: {
            id: payload.workspaceId,
            name: workspace?.name ?? "A workspace",
          },
          projectCount: uniqueProjectNames.length,
          conversations,
        });
        const subject =
          uniqueProjectNames.length > 1
            ? `[Dust] New conversations in your projects`
            : `[Dust] New conversation${pluralize(conversations.length)} in '${uniqueProjectNames[0]}'`;
        return {
          subject,
          body,
        };
      },
      {
        skip: async () => {
          if (!details) {
            return true;
          }
          const shouldSkip = await concurrentExecutor(
            events,
            async (event) => {
              return shouldSkipConversation({
                subscriberId: subscriber.subscriberId,
                payload: event.payload as ProjectNewConversationPayloadType,
              });
            },
            { concurrency: 8 }
          );

          // Do not skip if at least one conversation is not skipped.
          return shouldSkip.every(Boolean);
        },
      }
    );
  },
  {
    payloadSchema: projectNewConversationPayloadSchema,
    tags: ["conversations"] as NotificationAllowedTags,
  }
);
