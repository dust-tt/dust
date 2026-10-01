import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import type { PodAddedAsMemberPayloadType } from "@app/lib/notifications/triggers/pod-added-as-member";
import { PodAddedAsMemberPayloadSchema } from "@app/lib/notifications/triggers/pod-added-as-member";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { getPodRoute } from "@app/lib/utils/router";
import { POD_ADDED_AS_MEMBER_TRIGGER_ID } from "@app/types/notification_preferences";
import { workflow } from "@novu/framework";
import z from "zod";

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
