import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import type { BalanceThresholdReachedPayloadType } from "@app/lib/notifications/triggers/balance-threshold-reached";
import { BalanceThresholdReachedPayloadSchema } from "@app/lib/notifications/triggers/balance-threshold-reached";
import {
  BALANCE_THRESHOLD_REACHED_TAG,
  BALANCE_THRESHOLD_REACHED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { workflow } from "@novu/framework";

export function buildBalanceThresholdReachedEmailCopy(
  i18n: I18n,
  {
    balanceThresholdCredits,
    remainingBalanceCredits,
    isEnterprise,
  }: Pick<
    BalanceThresholdReachedPayloadType,
    "balanceThresholdCredits" | "remainingBalanceCredits" | "isEnterprise"
  >
): { subject: string; content: string; actionLabel: string } {
  const threshold = i18n.number(balanceThresholdCredits);
  const subject = i18n._(
    msg`[Dust] Credit balance alert - your workspace balance dropped below ${threshold} credits`
  );

  const lines = [
    i18n._(
      msg`Your workspace's remaining credit balance has dropped below the threshold you configured.`
    ),
    i18n._(msg`Alert threshold: ${threshold} credits`),
  ];
  if (remainingBalanceCredits !== null) {
    const remaining = i18n.number(remainingBalanceCredits);
    lines.push(
      i18n._(
        msg`${plural(remainingBalanceCredits, {
          one: `Remaining balance: ${remaining} credit`,
          other: `Remaining balance: ${remaining} credits`,
        })}`
      )
    );
  }
  lines.push(
    isEnterprise
      ? i18n._(
          msg`To avoid running out of credits, please reach out to your Dust representative.`
        )
      : i18n._(
          msg`To avoid running out of credits, you can purchase more from your workspace usage page.`
        )
  );

  return {
    subject,
    content: lines.join("\n"),
    actionLabel: isEnterprise
      ? i18n._(msg`Manage credits`)
      : i18n._(msg`See usage details`),
  };
}

// Email-only for now (no in-app step).
export const balanceThresholdReachedWorkflow = workflow(
  BALANCE_THRESHOLD_REACHED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("balance-threshold-reached-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content, actionLabel } =
        buildBalanceThresholdReachedEmailCopy(i18n, payload);

      const body = await renderEmail({
        i18n,
        name: subscriber.firstName ?? undefined,
        workspace: {
          id: payload.workspaceId,
          name: payload.workspaceName,
        },
        content,
        action: {
          label: actionLabel,
          url: `${config.getAppUrl()}/w/${payload.workspaceId}/usage`,
        },
      });
      return { subject, body };
    });
  },
  {
    payloadSchema: BalanceThresholdReachedPayloadSchema,
    tags: [BALANCE_THRESHOLD_REACHED_TAG],
  }
);
