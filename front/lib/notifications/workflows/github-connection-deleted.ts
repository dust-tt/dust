import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import type { TransactionalEmailCopy } from "@app/lib/notifications/transactional_emails";
import {
  contactSupportLine,
  TRANSACTIONAL_EMAIL_PREFERENCES,
} from "@app/lib/notifications/transactional_emails";
import type { GitHubConnectionDeletedPayloadType } from "@app/lib/notifications/triggers/github-connection-deleted";
import { GitHubConnectionDeletedPayloadSchema } from "@app/lib/notifications/triggers/github-connection-deleted";
import { GITHUB_CONNECTION_DELETED_TRIGGER_ID } from "@app/types/notification_preferences";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { workflow } from "@novu/framework";

export function buildGitHubConnectionDeletedEmailCopy(
  i18n: I18n,
  { workspaceName }: Pick<GitHubConnectionDeletedPayloadType, "workspaceName">
): TransactionalEmailCopy {
  return {
    subject: i18n._(
      msg`[Dust] GitHub connection deleted - important information`
    ),
    content: [
      i18n._(
        msg`The GitHub connection of the ${workspaceName} workspace was deleted, along with all the related data on Dust servers.`
      ),
      i18n._(
        msg`You can now uninstall the Dust app from your GitHub account to revoke the authorizations granted to Dust when you connected it.`
      ),
      contactSupportLine(i18n),
    ].join("\n"),
  };
}

export const gitHubConnectionDeletedWorkflow = workflow(
  GITHUB_CONNECTION_DELETED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("github-connection-deleted-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content } = buildGitHubConnectionDeletedEmailCopy(
        i18n,
        payload
      );

      const body = await renderEmail({
        i18n,
        name: subscriber.firstName ?? undefined,
        workspace: { id: payload.workspaceId, name: payload.workspaceName },
        content,
        showNotificationPreferences: false,
      });
      return { subject, body };
    });
  },
  {
    payloadSchema: GitHubConnectionDeletedPayloadSchema,
    preferences: TRANSACTIONAL_EMAIL_PREFERENCES,
  }
);
