import { workflow } from "@novu/framework";
import z from "zod";

import { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { getNovuClient } from "@app/lib/notifications";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { getSpaceRoute } from "@app/lib/utils/router";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

const ProjectAddedAsMemberPayloadSchema = z.object({
  workspaceId: z.string(),
  projectId: z.string(),
  userThatAddedYouId: z.string(),
});

type ProjectAddedAsMemberPayloadType = z.infer<
  typeof ProjectAddedAsMemberPayloadSchema
>;

const PROJECT_ADDED_AS_MEMBER_TRIGGER_ID = "project-added-as-member";

const ProjectDetailsSchema = z.object({
  projectName: z.string(),
  userThatAddedYouFullname: z.string(),
  workspaceName: z.string(),
});

type ProjectDetailsType = z.infer<typeof ProjectDetailsSchema>;

const getProjectDetails = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: ProjectAddedAsMemberPayloadType;
}): Promise<ProjectDetailsType> => {
  let projectName: string = "A project";
  let userThatAddedYouFullname: string = "Someone";
  let workspaceName: string = "A workspace";

  if (subscriberId) {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );

    const project = await SpaceResource.fetchById(auth, payload.projectId);

    if (project) {
      workspaceName = auth.getNonNullableWorkspace().name;
      projectName = project.name;

      const userThatAddedYou = await UserResource.fetchById(
        payload.userThatAddedYouId
      );

      if (userThatAddedYou) {
        userThatAddedYouFullname = userThatAddedYou.fullName();
      }
    }
  }
  return {
    projectName,
    userThatAddedYouFullname,
    workspaceName,
  };
};

const shouldSkipProject = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: ProjectAddedAsMemberPayloadType;
}): Promise<boolean> => {
  if (subscriberId) {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );

    const project = await SpaceResource.fetchById(auth, payload.projectId);

    if (!project) {
      return true;
    }
  }

  return false;
};

export const projectAddedAsMemberWorkflow = workflow(
  PROJECT_ADDED_AS_MEMBER_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    const details = await step.custom(
      "get-project-details",
      async () => {
        return getProjectDetails({
          subscriberId: subscriber.subscriberId,
          payload,
        });
      },
      {
        outputSchema: ProjectDetailsSchema,
      }
    );

    await step.inApp(
      "send-in-app",
      async () => {
        return {
          subject: details.projectName,
          body: `${details.userThatAddedYouFullname} added you to the project.`,
          primaryAction: {
            label: "View",
            redirect: {
              url: getSpaceRoute(payload.workspaceId, payload.projectId),
            },
          },
          data: {
            autoDelete: true,
            projectId: payload.projectId,
          },
        };
      },
      {
        skip: async () => shouldSkipProject({ payload }),
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
          content: `${details.userThatAddedYouFullname} added you to the project "${details.projectName}".`,
          action: {
            label: "View project",
            url:
              process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL +
              getSpaceRoute(payload.workspaceId, payload.projectId),
          },
        });
        return {
          subject: `[Dust] You were added to project '${details.projectName}'`,
          body,
        };
      },
      {
        skip: async () => {
          return shouldSkipProject({ payload });
        },
      }
    );
  },
  {
    payloadSchema: ProjectAddedAsMemberPayloadSchema,
    tags: ["admin"] as NotificationAllowedTags,
  }
);

export const triggerProjectAddedAsMemberNotifications = async (
  auth: Authenticator,
  {
    project,
    addedUserIds,
  }: {
    project: SpaceResource;
    addedUserIds: string[];
  }
): Promise<Result<void, DustError<"internal_error">>> => {
  // Only notify for project spaces.
  if (!project.isProject()) {
    return new Ok(undefined);
  }

  const userThatAddedYou = auth.user();

  // If no user context (e.g., API call without specific user), skip notification.
  if (!userThatAddedYou) {
    return new Ok(undefined);
  }

  // Filter out the user who added them (don't notify yourself).
  const userIdsToNotify = addedUserIds.filter(
    (userId) => userId !== userThatAddedYou.sId
  );

  if (userIdsToNotify.length === 0) {
    return new Ok(undefined);
  }

  const addedUsers = await UserResource.fetchByIds(userIdsToNotify);
  if (addedUsers.length === 0) {
    return new Ok(undefined);
  }

  try {
    const novuClient = await getNovuClient();

    const payload: ProjectAddedAsMemberPayloadType = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      projectId: project.sId,
      userThatAddedYouId: userThatAddedYou.sId,
    };

    const r = await novuClient.bulkTrigger(
      addedUsers.map((user: UserResource) => ({
        name: PROJECT_ADDED_AS_MEMBER_TRIGGER_ID,
        to: {
          subscriberId: user.sId,
          email: user.email,
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
        },
        payload,
      }))
    );

    if (r.status < 200 || r.status >= 300) {
      return new Err({
        name: "dust_error",
        code: "internal_error",
        message: "Failed to trigger project added as member notification",
        cause: r.statusText,
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Failed to trigger project added as member notification",
    });
  }

  return new Ok(undefined);
};
