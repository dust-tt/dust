import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import type { TransactionalEmailCopy } from "@app/lib/notifications/transactional_emails";
import { TRANSACTIONAL_EMAIL_PREFERENCES } from "@app/lib/notifications/transactional_emails";
import type { AccessRequestPayloadType } from "@app/lib/notifications/triggers/access-request";
import { AccessRequestPayloadSchema } from "@app/lib/notifications/triggers/access-request";
import { ACCESS_REQUEST_TRIGGER_ID } from "@app/types/notification_preferences";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { workflow } from "@novu/framework";

export function buildAccessRequestEmailCopy(
  i18n: I18n,
  {
    resourceKind,
    resourceName,
    requesterName,
    requesterEmail,
    message,
  }: Pick<
    AccessRequestPayloadType,
    | "resourceKind"
    | "resourceName"
    | "requesterName"
    | "requesterEmail"
    | "message"
  >
): TransactionalEmailCopy {
  let subject: string;
  let intro: string;
  switch (resourceKind) {
    case "data_source":
      subject = i18n._(
        msg`[Dust] ${requesterName} requests access to the ${resourceName} connection`
      );
      intro = i18n._(
        msg`${requesterName} (${requesterEmail}) sent you a request regarding access to the ${resourceName} connection:`
      );
      break;
    case "mcp_server":
      subject = i18n._(
        msg`[Dust] ${requesterName} requests access to the ${resourceName} tools`
      );
      intro = i18n._(
        msg`${requesterName} (${requesterEmail}) sent you a request regarding access to the ${resourceName} tools:`
      );
      break;
    default:
      assertNever(resourceKind);
  }

  return {
    subject,
    content: [
      intro,
      message,
      i18n._(msg`To answer, write to ${requesterEmail}.`),
    ].join("\n"),
    action: {
      label: i18n._(msg`Reply to ${requesterName}`),
      url: `mailto:${requesterEmail}`,
    },
  };
}

export const accessRequestWorkflow = workflow(
  ACCESS_REQUEST_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("access-request-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content, action } = buildAccessRequestEmailCopy(
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
    payloadSchema: AccessRequestPayloadSchema,
    preferences: TRANSACTIONAL_EMAIL_PREFERENCES,
  }
);
