import config from "@app/lib/api/config";
import { renderEmail } from "@app/lib/notifications/email-templates/default";
import { getNotificationI18n } from "@app/lib/notifications/i18n";
import { getNotificationLocale } from "@app/lib/notifications/locale";
import type { TransactionalEmailCopy } from "@app/lib/notifications/transactional_emails";
import {
  contactSupportLine,
  TRANSACTIONAL_EMAIL_PREFERENCES,
} from "@app/lib/notifications/transactional_emails";
import type {
  SubscriptionCanceledPayloadType,
  SubscriptionPaymentFailedPayloadType,
  SubscriptionReactivatedPayloadType,
  WorkspaceDataDeletionPayloadType,
} from "@app/lib/notifications/triggers/subscription-lifecycle";
import {
  SubscriptionCanceledPayloadSchema,
  SubscriptionPaymentFailedPayloadSchema,
  SubscriptionReactivatedPayloadSchema,
  WorkspaceDataDeletionPayloadSchema,
} from "@app/lib/notifications/triggers/subscription-lifecycle";
import {
  SUBSCRIPTION_CANCELED_TRIGGER_ID,
  SUBSCRIPTION_PAYMENT_FAILED_TRIGGER_ID,
  SUBSCRIPTION_REACTIVATED_TRIGGER_ID,
  WORKSPACE_DATA_DELETION_TRIGGER_ID,
} from "@app/types/notification_preferences";
import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { workflow } from "@novu/framework";

const CANCELLATION_FAQ_URL =
  "https://docs.dust.tt/docs/subscriptions#what-happens-when-we-cancel-our-dust-subscription";

function subscriptionUrl(workspaceId: string): string {
  return `${config.getAppUrl()}/w/${workspaceId}/subscription`;
}

export function buildSubscriptionCanceledEmailCopy(
  i18n: I18n,
  { workspaceId, workspaceName, endDate }: SubscriptionCanceledPayloadType
): TransactionalEmailCopy {
  const formattedEndDate = i18n.date(new Date(endDate), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return {
    subject: i18n._(msg`[Dust] Subscription canceled - important information`),
    content: [
      i18n._(
        msg`You canceled the subscription of the ${workspaceName} workspace. It will end with your current billing period, on ${formattedEndDate}. You can reactivate it at any time before then.`
      ),
      i18n._(
        msg`If you don't reactivate it, your workspace will switch back to the free plan:`
      ),
      i18n._(
        msg`• All users will be removed from the workspace except for the most tenured admin.`
      ),
      i18n._(
        msg`• Connections will be removed and their data deleted from Dust.`
      ),
      i18n._(
        msg`• Conversations, custom agents, and data sources will remain accessible, with the limits of the free plan.`
      ),
      i18n._(
        msg`• Folders holding more than 50 MB of data will be deleted after the end of your billing period.`
      ),
      i18n._(msg`Learn more in our cancellation FAQ: ${CANCELLATION_FAQ_URL}`),
      contactSupportLine(i18n),
    ].join("\n"),
    action: {
      label: i18n._(msg`Manage your subscription`),
      url: subscriptionUrl(workspaceId),
    },
  };
}

export function buildSubscriptionReactivatedEmailCopy(
  i18n: I18n,
  { workspaceName }: SubscriptionReactivatedPayloadType
): TransactionalEmailCopy {
  return {
    subject: i18n._(msg`[Dust] Your subscription has been reactivated`),
    content: [
      i18n._(
        msg`The subscription of the ${workspaceName} workspace has been reactivated.`
      ),
      i18n._(
        msg`It won't be canceled at the end of the billing period, no downgrade will happen, and you can keep using Dust as usual.`
      ),
      i18n._(msg`Thank you for renewing your trust in us.`),
      contactSupportLine(i18n),
    ].join("\n"),
  };
}

export function buildSubscriptionPaymentFailedEmailCopy(
  i18n: I18n,
  { workspaceId, workspaceName }: SubscriptionPaymentFailedPayloadType
): TransactionalEmailCopy {
  return {
    subject: i18n._(msg`[Dust] Your payment has failed`),
    content: [
      i18n._(
        msg`The latest payment for the ${workspaceName} workspace has failed. Please update your payment information.`
      ),
      i18n._(
        msg`Your workspace will be downgraded after 3 failed payment retries. This removes every feature of your paid plan, permanently deletes your connections and their data, and removes the agents linked to those connections.`
      ),
      contactSupportLine(i18n),
    ].join("\n"),
    action: {
      label: i18n._(msg`Update payment information`),
      url: `${subscriptionUrl(workspaceId)}/manage`,
    },
  };
}

export function buildWorkspaceDataDeletionEmailCopy(
  i18n: I18n,
  {
    workspaceId,
    workspaceName,
    remainingDays,
    isTrialEnd,
    isLast,
  }: WorkspaceDataDeletionPayloadType
): TransactionalEmailCopy {
  const subject = isLast
    ? i18n._(
        msg`${plural(remainingDays, {
          one: "Last reminder: your Dust data will be deleted in # day",
          other: "Last reminder: your Dust data will be deleted in # days",
        })}`
      )
    : i18n._(
        msg`${plural(remainingDays, {
          one: "Your Dust data will be deleted in # day",
          other: "Your Dust data will be deleted in # days",
        })}`
      );

  const lines = isTrialEnd
    ? [
        i18n._(
          msg`You're receiving this as an admin of the Dust workspace ${workspaceName}. Your trial period has ended.`
        ),
        i18n._(
          msg`${plural(remainingDays, {
            one: "To keep using Dust and avoid losing your data, please subscribe within # day. After that, your data will be permanently deleted and you will no longer be able to access your workspace.",
            other:
              "To keep using Dust and avoid losing your data, please subscribe within # days. After that, your data will be permanently deleted and you will no longer be able to access your workspace.",
          })}`
        ),
        i18n._(
          msg`Subscribe now to keep your conversations, custom agents, and data sources, and keep using Dust without interruption.`
        ),
      ]
    : [
        i18n._(
          msg`You're receiving this as an admin of the Dust workspace ${workspaceName}. You recently canceled your Dust subscription.`
        ),
        i18n._(
          msg`${plural(remainingDays, {
            one: "To protect your privacy and maintain the highest security standards, your data will be permanently deleted in # day.",
            other:
              "To protect your privacy and maintain the highest security standards, your data will be permanently deleted in # days.",
          })}`
        ),
        i18n._(
          msg`${plural(remainingDays, {
            one: "To keep your data, please subscribe again within # day. After that, data recovery will not be possible.",
            other:
              "To keep your data, please subscribe again within # days. After that, data recovery will not be possible.",
          })}`
        ),
      ];
  lines.push(contactSupportLine(i18n));
  if (isLast) {
    lines.push(i18n._(msg`This is our last message before data deletion.`));
  }

  return {
    subject,
    content: lines.join("\n"),
    action: {
      label: i18n._(msg`Subscribe`),
      url: subscriptionUrl(workspaceId),
    },
  };
}

export const subscriptionCanceledWorkflow = workflow(
  SUBSCRIPTION_CANCELED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("subscription-canceled-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content, action } = buildSubscriptionCanceledEmailCopy(
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
    payloadSchema: SubscriptionCanceledPayloadSchema,
    preferences: TRANSACTIONAL_EMAIL_PREFERENCES,
  }
);

export const subscriptionReactivatedWorkflow = workflow(
  SUBSCRIPTION_REACTIVATED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("subscription-reactivated-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content, action } =
        buildSubscriptionReactivatedEmailCopy(i18n, payload);

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
    payloadSchema: SubscriptionReactivatedPayloadSchema,
    preferences: TRANSACTIONAL_EMAIL_PREFERENCES,
  }
);

export const subscriptionPaymentFailedWorkflow = workflow(
  SUBSCRIPTION_PAYMENT_FAILED_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("subscription-payment-failed-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content, action } =
        buildSubscriptionPaymentFailedEmailCopy(i18n, payload);

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
    payloadSchema: SubscriptionPaymentFailedPayloadSchema,
    preferences: TRANSACTIONAL_EMAIL_PREFERENCES,
  }
);

export const workspaceDataDeletionWorkflow = workflow(
  WORKSPACE_DATA_DELETION_TRIGGER_ID,
  async ({ step, payload, subscriber }) => {
    await step.email("workspace-data-deletion-email", async () => {
      const i18n = await getNotificationI18n(
        await getNotificationLocale(
          subscriber.subscriberId,
          payload.workspaceId
        )
      );
      const { subject, content, action } = buildWorkspaceDataDeletionEmailCopy(
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
    payloadSchema: WorkspaceDataDeletionPayloadSchema,
    preferences: TRANSACTIONAL_EMAIL_PREFERENCES,
  }
);
