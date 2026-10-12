import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import type { TransactionalEmailCopy } from "@app/lib/notifications/transactional_emails";
import {
  contactSupportLine,
  TRANSACTIONAL_EMAIL_PREFERENCES,
} from "@app/lib/notifications/transactional_emails";
import type { CreditUsageAlertPayloadType } from "@app/lib/notifications/triggers/credit-usage-alert";
import { CreditUsageAlertPayloadSchema } from "@app/lib/notifications/triggers/credit-usage-alert";
import { CREDIT_USAGE_ALERT_TRIGGER_ID } from "@app/types/notification_preferences";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { workflow } from "@novu/framework";

const PROGRAMMATIC_USAGE_DOC_URL =
  "https://dust-tt.notion.site/Programmatic-usage-at-Dust-2b728599d94181ceb124d8585f794e2e";

export function buildCreditUsageAlertEmailCopy(
  i18n: I18n,
  {
    workspaceId,
    workspaceName,
    percentUsed,
    totalInitialMicroUsd,
    totalConsumedMicroUsd,
  }: CreditUsageAlertPayloadType
): TransactionalEmailCopy {
  const formatUsd = (microUsd: number) =>
    i18n.number(microUsd / 1_000_000, { style: "currency", currency: "USD" });
  const total = formatUsd(totalInitialMicroUsd);
  const consumed = formatUsd(totalConsumedMicroUsd);
  const remaining = formatUsd(totalInitialMicroUsd - totalConsumedMicroUsd);

  return {
    subject: i18n._(
      msg`[Dust] Credit usage alert: ${percentUsed}% of your credits consumed`
    ),
    content: [
      i18n._(
        msg`You're receiving this as an admin of the Dust workspace ${workspaceName}.`
      ),
      i18n._(
        msg`Your workspace has consumed ${percentUsed}% of its available programmatic usage credits.`
      ),
      i18n._(msg`• Total credits: ${total}`),
      i18n._(msg`• Consumed: ${consumed}`),
      i18n._(msg`• Remaining: ${remaining}`),
      i18n._(
        msg`To avoid service interruption, purchase additional credits from the Developers > Credits section.`
      ),
      i18n._(
        msg`Learn more about programmatic usage at Dust: ${PROGRAMMATIC_USAGE_DOC_URL}`
      ),
      contactSupportLine(i18n),
    ].join("\n"),
    action: {
      label: i18n._(msg`Purchase credits`),
      url: `${config.getAppUrl()}/w/${workspaceId}/developers/credits-usage`,
    },
  };
}

export const creditUsageAlertWorkflow = workflow(
  CREDIT_USAGE_ALERT_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("credit-usage-alert-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content, action } = buildCreditUsageAlertEmailCopy(
        i18n,
        payload
      );

      const body = await renderEmail({
        i18n,
        name: subscriber.firstName ?? undefined,
        workspace: { id: payload.workspaceId, name: payload.workspaceName },
        content,
        showNotificationPreferences: false,
        action,
      });
      return { subject, body };
    });
  },
  {
    payloadSchema: CreditUsageAlertPayloadSchema,
    preferences: TRANSACTIONAL_EMAIL_PREFERENCES,
  }
);
