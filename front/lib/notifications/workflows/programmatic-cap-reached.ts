import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import type { ProgrammaticCapReachedPayloadType } from "@app/lib/notifications/triggers/programmatic-cap-reached";
import { ProgrammaticCapReachedPayloadSchema } from "@app/lib/notifications/triggers/programmatic-cap-reached";
import {
  PROGRAMMATIC_CAP_REACHED_TAG,
  PROGRAMMATIC_CAP_REACHED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { workflow } from "@novu/framework";

export function buildProgrammaticCapReachedEmailCopy(
  i18n: I18n,
  {
    workspaceName,
    monthlyCapCredits,
    reason,
  }: Pick<
    ProgrammaticCapReachedPayloadType,
    "workspaceName" | "monthlyCapCredits" | "reason"
  >
): { subject: string; content: string } {
  const cap =
    monthlyCapCredits !== null ? i18n.number(monthlyCapCredits) : null;

  switch (reason) {
    case "programmatic_cap_warning":
      return {
        subject: i18n._(
          msg`[Dust] Your workspace has used 80% of its programmatic API credit cap in ${workspaceName}`
        ),
        content: [
          cap !== null
            ? i18n._(
                msg`Your workspace "${workspaceName}" has used 80% of its monthly programmatic API credit cap of ${cap} credits.`
              )
            : i18n._(
                msg`Your workspace "${workspaceName}" has used 80% of its monthly programmatic API credit cap.`
              ),
          i18n._(
            msg`Once the cap is fully reached, programmatic API calls will be blocked. Consider raising the cap before that happens.`
          ),
        ].join("\n"),
      };
    case "programmatic_cap_exhausted":
      return {
        subject: i18n._(
          msg`[Dust] Your workspace has reached its programmatic API credit cap in ${workspaceName}`
        ),
        content: [
          cap !== null
            ? i18n._(
                msg`Your workspace "${workspaceName}" has exhausted its monthly programmatic API credit cap of ${cap} credits.`
              )
            : i18n._(
                msg`Your workspace "${workspaceName}" has exhausted its monthly programmatic API credit cap.`
              ),
          i18n._(
            msg`Programmatic API calls are now blocked until the billing cycle resets or the cap is raised.`
          ),
        ].join("\n"),
      };
    case "programmatic_cap_disabled":
      return {
        subject: i18n._(
          msg`[Dust] Your programmatic triggers are paused in ${workspaceName}`
        ),
        content: [
          i18n._(
            msg`A programmatic trigger in your Dust workspace "${workspaceName}" could not run because the workspace's monthly programmatic usage limit is set to 0 credits.`
          ),
          i18n._(
            msg`Programmatic triggers will remain blocked until you set a positive limit in workspace usage settings.`
          ),
        ].join("\n"),
      };
    default:
      return assertNever(reason);
  }
}

// Email-only (no in-app): these notifications target workspace admins who
// manage programmatic API usage, not individual end-users.
export const programmaticCapReachedWorkflow = workflow(
  PROGRAMMATIC_CAP_REACHED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("programmatic-cap-reached-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content } = buildProgrammaticCapReachedEmailCopy(
        i18n,
        payload
      );

      const body = await renderEmail({
        i18n,
        name: subscriber.firstName ?? undefined,
        workspace: {
          id: payload.workspaceId,
          name: payload.workspaceName,
        },
        content,
        action: {
          label: i18n._(msg`Manage workspace usage`),
          url: `${config.getAppUrl()}/w/${payload.workspaceId}/usage`,
        },
      });
      return { subject, body };
    });
  },
  {
    payloadSchema: ProgrammaticCapReachedPayloadSchema,
    tags: [PROGRAMMATIC_CAP_REACHED_TAG],
  }
);
