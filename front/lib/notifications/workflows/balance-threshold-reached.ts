import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { BalanceThresholdReachedPayloadSchema } from "@app/lib/notifications/triggers/balance-threshold-reached";
import { DEFAULT_LOCALE } from "@app/types/locale";
import {
  BALANCE_THRESHOLD_REACHED_TAG,
  BALANCE_THRESHOLD_REACHED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import { workflow } from "@novu/framework";

function formatCredits(credits: number): string {
  return credits.toLocaleString("en-US");
}

// Email-only for now (no in-app step).
export const balanceThresholdReachedWorkflow = workflow(
  BALANCE_THRESHOLD_REACHED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("balance-threshold-reached-email", async () => {
      const subject = `[Dust] Credit balance alert - your workspace balance dropped below ${formatCredits(
        payload.balanceThresholdCredits
      )} credits`;

      const remainingLine =
        payload.remainingBalanceCredits !== null
          ? `\nRemaining balance: ${formatCredits(payload.remainingBalanceCredits)} credits`
          : "";
      const purchaseLine = payload.isEnterprise
        ? `To avoid running out of credits, please reach out to your Dust representative.`
        : `To avoid running out of credits, you can purchase more from your workspace usage page.`;
      const content =
        `Your workspace's remaining credit balance has dropped below the threshold you configured.\n` +
        `Alert threshold: ${formatCredits(payload.balanceThresholdCredits)} credits${remainingLine}\n` +
        purchaseLine;

      const body = await renderEmail({
        i18n: await getNotificationI18n(DEFAULT_LOCALE),
        name: subscriber.firstName ?? "there",
        workspace: {
          id: payload.workspaceId,
          name: payload.workspaceName,
        },
        content,
        action: {
          label: payload.isEnterprise ? "Manage credits" : "See usage details",
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
