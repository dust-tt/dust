import { workflow } from "@novu/framework";
import z from "zod";

import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getConversationRoute } from "@app/lib/utils/router";
import type { Result } from "@app/types";
import { Err, isProjectConversation, Ok } from "@app/types";
import { WORKFLOW_TRIGGER_IDS } from "@app/types/notification_preferences";
import { assertNever } from "@app/types/shared/utils/assert_never";

import { renderEmail } from "../email-templates/default";
import type { ProjectNewConversationPayloadType } from "../triggers/project-new-conversation";
import { projectNewConversationPayloadSchema } from "../triggers/project-new-conversation";

const ConversationDetailsSchema = z.object({
  projectName: z.string(),
  userThatCreatedConversationFullName: z.string(),
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

type ProjectDetailsType = z.infer<typeof ConversationDetailsSchema>;

const getProjectDetails = async ({
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
    });
  }

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    subscriberId,
    payload.workspaceId
  );

  const conversationResource = await ConversationResource.fetchById(
    auth,
    payload.conversationId
  );

  const conversation = conversationResource?.toJSON();

  if (!conversation) {
    return new Err(
      new DustError("conversation_not_found", "Conversation not found")
    );
  }

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

  return new Ok({
    projectName: project.name,
    userThatCreatedConversationFullName: userThatCreatedConversation.fullName(),
  });
};

const shouldSkipConversation = async ({
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

  const conversationParticipants =
    await conversationResource.listParticipants(auth);

  const isConversatinParticipant = conversationParticipants.some(
    (participant) => participant.sId === subscriberId
  );

  if (isConversatinParticipant) {
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

export const projectNewConversationWorkflow = workflow(
  WORKFLOW_TRIGGER_IDS.PROJECT_NEW_CONVERSATION,
  async ({ step, payload, subscriber }) => {
    const detailsResult = await step.custom(
      "get-project-details",
      async () => {
        const details = await getProjectDetails({
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
          subject: details.projectName,
          body: `${details.userThatCreatedConversationFullName} created a new conversation in "${details.projectName}".`,
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

    await step.email(
      "send-email",
      async () => {
        const workspace = await WorkspaceResource.fetchById(
          payload.workspaceId
        );
        // Details is guaranteed non-null because the step is skipped otherwise
        if (!details) {
          return {
            subject: "",
            body: "",
          };
        }
        const body = await renderEmail({
          name: subscriber.firstName ?? "You",
          workspace: {
            id: payload.workspaceId,
            name: workspace?.name ?? "A workspace",
          },
          content: `${details.userThatCreatedConversationFullName} created a new conversation in "${details.projectName}".`,
          action: {
            label: "View conversation",
            url: getConversationRoute(
              payload.workspaceId,
              payload.conversationId,
              undefined,
              config.getAppUrl()
            ),
          },
        });
        return {
          subject: `[Dust] New conversation in '${details.projectName}'`,
          body,
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
  },
  {
    payloadSchema: projectNewConversationPayloadSchema,
    tags: ["conversations"] as NotificationAllowedTags,
  }
);
