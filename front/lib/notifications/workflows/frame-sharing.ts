import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import { TRANSACTIONAL_EMAIL_PREFERENCES } from "@app/lib/notifications/transactional_emails";
import type {
  FrameLoginCodePayloadType,
  FrameSharedPayloadType,
} from "@app/lib/notifications/triggers/frame-sharing";
import {
  FrameLoginCodePayloadSchema,
  FrameSharedPayloadSchema,
} from "@app/lib/notifications/triggers/frame-sharing";
import {
  FRAME_LOGIN_CODE_TRIGGER_ID,
  FRAME_SHARED_TRIGGER_ID,
} from "@app/types/notification_preferences";
import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { workflow } from "@novu/framework";

// The code itself is rendered below the content, right after "Your login code:".
export function buildFrameLoginCodeEmailCopy(
  i18n: I18n,
  {
    sharedByName,
    expiresInMinutes,
  }: Pick<FrameLoginCodePayloadType, "sharedByName" | "expiresInMinutes">
): { subject: string; content: string } {
  return {
    subject: i18n._(msg`Your Dust login code`),
    content: [
      i18n._(msg`${sharedByName} shared a frame with you on Dust.`),
      i18n._(
        msg`${plural(expiresInMinutes, {
          one: "The code expires in # minute.",
          other: "The code expires in # minutes.",
        })} Didn't request it? Ignore this email.`
      ),
      i18n._(msg`Your login code:`),
    ].join("\n"),
  };
}

export function buildFrameSharedEmailCopy(
  i18n: I18n,
  { sharedByName }: Pick<FrameSharedPayloadType, "sharedByName">
): { subject: string; content: string; actionLabel: string } {
  return {
    subject: i18n._(msg`${sharedByName} shared a frame with you`),
    content: i18n._(msg`${sharedByName} is sharing a frame with you on Dust.`),
    actionLabel: i18n._(msg`View frame`),
  };
}

export const frameLoginCodeWorkflow = workflow(
  FRAME_LOGIN_CODE_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("frame-login-code-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content } = buildFrameLoginCodeEmailCopy(i18n, payload);

      const body = await renderEmail({
        i18n,
        name: subscriber.firstName ?? undefined,
        workspace: { id: payload.workspaceId, name: payload.workspaceName },
        content,
        highlight: payload.code,
        showNotificationPreferences: false,
      });
      return { subject, body };
    });
  },
  {
    payloadSchema: FrameLoginCodePayloadSchema,
    preferences: TRANSACTIONAL_EMAIL_PREFERENCES,
  }
);

export const frameSharedWorkflow = workflow(
  FRAME_SHARED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("frame-shared-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content, actionLabel } = buildFrameSharedEmailCopy(
        i18n,
        payload
      );

      const body = await renderEmail({
        i18n,
        name: subscriber.firstName ?? undefined,
        workspace: { id: payload.workspaceId, name: payload.workspaceName },
        content,
        showNotificationPreferences: false,
        action: { label: actionLabel, url: payload.frameUrl },
      });
      return { subject, body };
    });
  },
  { payloadSchema: FrameSharedPayloadSchema }
);
