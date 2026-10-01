import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import {
  USER_AWU_CAP_REACHED_TAG,
  USER_AWU_CAP_REACHED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { workflow } from "@novu/framework";
import z from "zod";

const UserAwuCapReachedPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  capAwuCredits: z.number(),
  // true → user has hit 100% and is now blocked; false → 80% warning.
  isBlocked: z.boolean(),
});

type UserAwuCapReachedPayloadType = z.infer<
  typeof UserAwuCapReachedPayloadSchema
>;

export function buildUserAwuCapReachedInAppCopy(
  i18n: I18n,
  { workspaceName, capAwuCredits, isBlocked }: UserAwuCapReachedPayloadType
): { subject: string; body: string } {
  const cap = i18n.number(capAwuCredits);
  return isBlocked
    ? {
        subject: i18n._(msg`You've reached your usage limit`),
        body: i18n._(
          msg`You have reached your ${cap} credits limit in workspace "${workspaceName}" and can no longer run agents. Contact your admin to increase your limit.`
        ),
      }
    : {
        subject: i18n._(msg`You've used 80% of your usage limit`),
        body: i18n._(
          msg`You have used 80% of your ${cap} credits limit in workspace "${workspaceName}". Contact your admin to increase your limit before you are blocked.`
        ),
      };
}

export function buildUserAwuCapReachedEmailCopy(
  i18n: I18n,
  { workspaceName, capAwuCredits, isBlocked }: UserAwuCapReachedPayloadType
): { subject: string; content: string } {
  const cap = i18n.number(capAwuCredits);
  return isBlocked
    ? {
        subject: i18n._(
          msg`[Dust] You've reached your usage limit in ${workspaceName}`
        ),
        content: [
          i18n._(
            msg`You have reached your ${cap} credits usage limit in the Dust workspace ${workspaceName} and can no longer run agents.`
          ),
          i18n._(
            msg`Please contact your workspace admin to increase your limit.`
          ),
        ].join("\n"),
      }
    : {
        subject: i18n._(
          msg`[Dust] You've used 80% of your usage limit in ${workspaceName}`
        ),
        content: [
          i18n._(
            msg`You have used 80% of your ${cap} credits usage limit in the Dust workspace ${workspaceName}.`
          ),
          i18n._(
            msg`Once you reach 100%, you won't be able to run agents until your limit is increased. Please contact your workspace admin.`
          ),
        ].join("\n"),
      };
}

export const userAwuCapReachedWorkflow = workflow(
  USER_AWU_CAP_REACHED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.inApp("user-awu-cap-reached-in-app", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, body } = buildUserAwuCapReachedInAppCopy(i18n, payload);
      return {
        subject,
        body,
        data: {
          workspaceId: payload.workspaceId,
          capAwuCredits: payload.capAwuCredits,
          isBlocked: payload.isBlocked,
        },
      };
    });

    await step.email("user-awu-cap-reached-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content } = buildUserAwuCapReachedEmailCopy(
        i18n,
        payload
      );
      const body = await renderEmail({
        i18n,
        name: subscriber.firstName ?? i18n._(msg`there`),
        workspace: {
          id: payload.workspaceId,
          name: payload.workspaceName,
        },
        content,
        action: {
          label: i18n._(msg`Go to workspace`),
          url: `${config.getAppUrl()}/w/${payload.workspaceId}`,
        },
      });
      return { subject, body };
    });
  },
  {
    payloadSchema: UserAwuCapReachedPayloadSchema,
    tags: [USER_AWU_CAP_REACHED_TAG],
  }
);
