import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import type { NotificationAllowedTags } from "@app/lib/notifications";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import type { PodAddedAsMemberPayloadType } from "@app/lib/notifications/triggers/pod-added-as-member";
import { PodAddedAsMemberPayloadSchema } from "@app/lib/notifications/triggers/pod-added-as-member";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { getPodRoute } from "@app/lib/utils/router";
import { POD_ADDED_AS_MEMBER_TRIGGER_ID } from "@app/types/notification_preferences";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { workflow } from "@novu/framework";
import z from "zod";

const PodDetailsSchema = z.object({
  podName: z.string(),
  userThatAddedYouFullname: z.string(),
  workspaceName: z.string(),
});

type PodDetailsType = z.infer<typeof PodDetailsSchema>;

const getPodDetails = async ({
  i18n,
  subscriberId,
  payload,
}: {
  i18n: I18n;
  subscriberId?: string | null;
  payload: PodAddedAsMemberPayloadType;
}): Promise<PodDetailsType> => {
  let podName: string = i18n._(msg`A Pod`);
  let userThatAddedYouFullname: string = i18n._(msg`Someone`);
  let workspaceName: string = i18n._(msg`A workspace`);

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

export function buildPodAddedAsMemberCopy(
  i18n: I18n,
  { podName, userThatAddedYouFullname }: PodDetailsType
): {
  emailSubject: string;
  content: string;
  inAppActionLabel: string;
  emailActionLabel: string;
} {
  return {
    emailSubject: i18n._(msg`[Dust] You were added to Pod "${podName}"`),
    content: i18n._(
      msg`${userThatAddedYouFullname} added you to Pod "${podName}".`
    ),
    inAppActionLabel: i18n._(msg({ message: "View", context: "action" })),
    emailActionLabel: i18n._(msg`View Pod`),
  };
}

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
        const i18n = await getNotificationI18n(
          await getNotificationLocale(
            subscriber.subscriberId,
            payload.workspaceId
          )
        );
        return getPodDetails({
          i18n,
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
        const i18n = await getNotificationI18n(
          await getNotificationLocale(
            subscriber.subscriberId,
            payload.workspaceId
          )
        );
        const { content, inAppActionLabel } = buildPodAddedAsMemberCopy(
          i18n,
          details
        );
        return {
          subject: details.podName,
          body: content,
          primaryAction: {
            label: inAppActionLabel,
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
        const i18n = await getNotificationI18n(
          await getNotificationLocale(
            subscriber.subscriberId,
            payload.workspaceId
          )
        );
        const { emailSubject, content, emailActionLabel } =
          buildPodAddedAsMemberCopy(i18n, details);
        const body = await renderEmail({
          i18n,
          name: subscriber.firstName ?? i18n._(msg`there`),
          workspace: {
            id: payload.workspaceId,
            name: details.workspaceName,
          },
          content,
          action: {
            label: emailActionLabel,
            url:
              config.getAppUrl() +
              getPodRoute(payload.workspaceId, payload.podId),
          },
        });
        return {
          subject: emailSubject,
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
