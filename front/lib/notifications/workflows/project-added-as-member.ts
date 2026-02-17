import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { getNovuClient } from "@app/lib/notifications";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { getProjectRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { PROJECT_ADDED_AS_MEMBER_TRIGGER_ID } from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { SpaceType } from "@app/types/space";
import { workflow } from "@novu/framework";
import z from "zod";

const ProjectAddedAsMemberPayloadSchema = z.object({
  workspaceId: z.string(),
  projectId: z.string(),
  userThatAddedYouId: z.string(),
});

type ProjectAddedAsMemberPayloadType = z.infer<
  typeof ProjectAddedAsMemberPayloadSchema
>;

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
          body: `${details.userThatAddedYouFullname} added you to project "${details.projectName}".`,
          primaryAction: {
            label: "View",
            redirect: {
              url: getProjectRoute(payload.workspaceId, payload.projectId),
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
          content: `${details.userThatAddedYouFullname} added you to project "${details.projectName}".`,
          action: {
            label: "View project",
            url:
              config.getClientFacingUrl() +
              getProjectRoute(payload.workspaceId, payload.projectId),
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

/**
 * Trigger notifications for users added to a project.
 * Should be called from API endpoints after successfully adding members.
 */
export const triggerProjectAddedAsMemberNotifications = async (
  auth: Authenticator,
  {
    project,
    addedUserIds,
  }: {
    project: SpaceType;
    addedUserIds: string[];
  }
): Promise<Result<void, DustError<"internal_error">>> => {
  // Only notify for project spaces.
  if (project.kind !== "project") {
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

    const r = await novuClient.triggerBulk({
      events: addedUsers.map((user: UserResource) => ({
        workflowId: PROJECT_ADDED_AS_MEMBER_TRIGGER_ID,
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
        message: `Failed to trigger project added as member notification: ${eventErrors}`,
      });
    }
  } catch (err) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Failed to trigger project added as member notification",
      cause: normalizeError(err),
    });
  }

  return new Ok(undefined);
};

/**
 * Fire-and-forget helper to trigger project member notifications.
 * The notification is sent asynchronously and errors are logged but don't block the caller.
 */
export function notifyProjectMembersAdded(
  auth: Authenticator,
  {
    project,
    addedUserIds,
  }: {
    project: SpaceType;
    addedUserIds: string[];
  }
): void {
  void triggerProjectAddedAsMemberNotifications(auth, {
    project,
    addedUserIds,
  }).then((notifRes) => {
    if (notifRes.isErr()) {
      logger.error(
        { error: notifRes.error, projectId: project.sId },
        "Failed to trigger project added as member notification"
      );
    }
  });
}
