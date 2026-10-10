import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import { TRANSACTIONAL_EMAIL_PREFERENCES } from "@app/lib/notifications/transactional_emails";
import type { WorkspaceInvitationPayloadType } from "@app/lib/notifications/triggers/workspace-invitation";
import { WorkspaceInvitationPayloadSchema } from "@app/lib/notifications/triggers/workspace-invitation";
import { WORKSPACE_INVITATION_TRIGGER_ID } from "@app/types/notification_preferences";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { workflow } from "@novu/framework";

export function buildWorkspaceInvitationEmailCopy(
  i18n: I18n,
  {
    workspaceName,
    inviterName,
    isReminder,
  }: Pick<
    WorkspaceInvitationPayloadType,
    "workspaceName" | "inviterName" | "isReminder"
  >
): { subject: string; content: string; actionLabel: string } {
  let subject: string;
  let intro: string;
  if (isReminder) {
    subject = i18n._(
      msg`[Dust] Reminder: you're invited to join ${workspaceName}`
    );
    intro = i18n._(
      msg`You were invited to join the ${workspaceName} workspace on Dust and haven't accepted the invitation yet.`
    );
  } else if (inviterName) {
    subject = i18n._(
      msg`[Dust] ${inviterName} invited you to join ${workspaceName}`
    );
    intro = i18n._(
      msg`${inviterName} invited you to join the ${workspaceName} workspace on Dust.`
    );
  } else {
    subject = i18n._(msg`[Dust] You're invited to join ${workspaceName}`);
    intro = i18n._(
      msg`You were invited to join the ${workspaceName} workspace on Dust.`
    );
  }

  const content = [
    intro,
    i18n._(
      msg`If you weren't expecting this invitation, you can ignore this email.`
    ),
  ].join("\n");

  return {
    subject,
    content,
    actionLabel: i18n._(msg`Accept the invitation`),
  };
}

export const workspaceInvitationWorkflow = workflow(
  WORKSPACE_INVITATION_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("workspace-invitation-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content, actionLabel } =
        buildWorkspaceInvitationEmailCopy(i18n, payload);

      const body = await renderEmail({
        i18n,
        name: subscriber.firstName ?? undefined,
        workspace: { id: payload.workspaceId, name: payload.workspaceName },
        content,
        showNotificationPreferences: false,
        action: { label: actionLabel, url: payload.inviteLink },
      });
      return { subject, body };
    });
  },
  {
    payloadSchema: WorkspaceInvitationPayloadSchema,
    preferences: TRANSACTIONAL_EMAIL_PREFERENCES,
  }
);
