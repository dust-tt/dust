import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { getNovuClient } from "@app/lib/notifications";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { getPodRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { POD_ADDED_AS_MEMBER_TRIGGER_ID } from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { SpaceType } from "@app/types/space";
import { workflow } from "@novu/framework";
import z from "zod";

const PodAddedAsMemberPayloadSchema = z.object({
  workspaceId: z.string(),
  podId: z.string(),
  userThatAddedYouId: z.string(),
});

type PodAddedAsMemberPayloadType = z.infer<
  typeof PodAddedAsMemberPayloadSchema
>;

const PodDetailsSchema = z.object({
  podName: z.string(),
  userThatAddedYouFullname: z.string(),
  workspaceName: z.string(),
});

type PodDetailsType = z.infer<typeof PodDetailsSchema>;

const getPodDetails = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: PodAddedAsMemberPayloadType;
}): Promise<PodDetailsType> => {
  let podName: string = "A Pod";
  let userThatAddedYouFullname: string = "Someone";
  let workspaceName: string = "A workspace";

  if (subscriberId) {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );

    const pod = await SpaceResource.fetchById(auth, payload.podId);

    if (pod) {
      workspaceName = auth.getNonNullableWorkspace().name;
      podName = pod.name;

      const userThatAddedYou = await UserResource.fetchById(
        payload.userThatAddedYouId
      );

      if (userThatAddedYou) {
        userThatAddedYouFullname = userThatAddedYou.fullName();
      }
    }
  }
  return {
    podName,
    userThatAddedYouFullname,
    workspaceName,
  };
};

const shouldSkipPod = async ({
  subscriberId,
  payload,
}: {
  subscriberId?: string | null;
  payload: PodAddedAsMemberPayloadType;
}): Promise<boolean> => {
  if (subscriberId) {
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );

    const pod = await SpaceResource.fetchById(auth, payload.podId);

    if (!pod) {
      return true;
    }
  }

  return false;
};

export const podAddedAsMemberWorkflow = workflow(
  POD_ADDED_AS_MEMBER_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    const details = await step.custom(
      "get-project-details",
      async () => {
        return getPodDetails({
          subscriberId: subscriber.subscriberId,
          payload,
        });
      },
      {
        outputSchema: PodDetailsSchema,
      }
    );

    await step.inApp(
      "send-in-app",
      async () => {
        return {
          subject: details.podName,
          body: `${details.userThatAddedYouFullname} added you to Pod "${details.podName}".`,
          primaryAction: {
            label: "View",
            redirect: {
              url: getPodRoute(payload.workspaceId, payload.podId),
            },
          },
          data: {
            autoDelete: true,
          },
        };
      },
      {
        skip: async () => shouldSkipPod({ payload }),
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
          content: `${details.userThatAddedYouFullname} added you to Pod "${details.podName}".`,
          action: {
            label: "View Pod",
            url:
              config.getAppUrl() +
              getPodRoute(payload.workspaceId, payload.podId),
          },
        });
        return {
          subject: `[Dust] You were added to Pod '${details.podName}'`,
          body,
        };
      },
      {
        skip: async () => {
          return shouldSkipPod({ payload });
        },
      }
    );
  },
  {
    payloadSchema: PodAddedAsMemberPayloadSchema,
    tags: ["admin"] as NotificationAllowedTags,
  }
);

/**
 * Trigger notifications for users added to a pod.
 * Should be called from API endpoints after successfully adding members.
 */
export const triggerPodAddedAsMemberNotifications = async (
  auth: Authenticator,
  {
    pod,
    addedUserIds,
  }: {
    pod: SpaceType;
    addedUserIds: string[];
  }
): Promise<Result<void, DustError<"internal_error">>> => {
  // Only notify for project spaces.
  if (pod.kind !== "project") {
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

    const payload: PodAddedAsMemberPayloadType = {
      workspaceId: auth.getNonNullableWorkspace().sId,
      podId: pod.sId,
      userThatAddedYouId: userThatAddedYou.sId,
    };

    const r = await novuClient.triggerBulk({
      events: addedUsers.map((user: UserResource) => ({
        workflowId: POD_ADDED_AS_MEMBER_TRIGGER_ID,
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
        message: `Failed to trigger pod added as member notification: ${eventErrors}`,
      });
    }
  } catch (err) {
    return new Err({
      name: "dust_error",
      code: "internal_error",
      message: "Failed to trigger pod added as member notification",
      cause: normalizeError(err),
    });
  }

  return new Ok(undefined);
};

/**
 * Fire-and-forget helper to trigger pod member notifications.
 * The notification is sent asynchronously and errors are logged but don't block the caller.
 */
export function notifyPodMembersAdded(
  auth: Authenticator,
  {
    pod,
    addedUserIds,
  }: {
    pod: SpaceType;
    addedUserIds: string[];
  }
): void {
  void triggerPodAddedAsMemberNotifications(auth, {
    pod: pod,
    addedUserIds,
  }).then((notifRes) => {
    if (notifRes.isErr()) {
      logger.error(
        { error: notifRes.error, podId: pod.sId },
        "Failed to trigger pod added as member notification"
      );
    }
  });
}
