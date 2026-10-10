import type { EmailRecipient } from "@app/lib/notifications/transactional_emails";
import { triggerEmailWorkflow } from "@app/lib/notifications/transactional_emails";
import {
  SUBSCRIPTION_CANCELED_TRIGGER_ID,
  SUBSCRIPTION_PAYMENT_FAILED_TRIGGER_ID,
  SUBSCRIPTION_REACTIVATED_TRIGGER_ID,
  WORKSPACE_DATA_DELETION_TRIGGER_ID,
} from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { z } from "zod";

const WorkspacePayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
});

export const SubscriptionCanceledPayloadSchema = WorkspacePayloadSchema.extend({
  // ISO 8601 date at which the subscription ends.
  endDate: z.string(),
});

export type SubscriptionCanceledPayloadType = z.infer<
  typeof SubscriptionCanceledPayloadSchema
>;

export const SubscriptionReactivatedPayloadSchema = WorkspacePayloadSchema;

export type SubscriptionReactivatedPayloadType = z.infer<
  typeof SubscriptionReactivatedPayloadSchema
>;

export const SubscriptionPaymentFailedPayloadSchema = WorkspacePayloadSchema;

export type SubscriptionPaymentFailedPayloadType = z.infer<
  typeof SubscriptionPaymentFailedPayloadSchema
>;

export const WorkspaceDataDeletionPayloadSchema = WorkspacePayloadSchema.extend(
  {
    remainingDays: z.number(),
    // The workspace's trial ended, as opposed to its subscription being canceled.
    isTrialEnd: z.boolean(),
    isLast: z.boolean(),
  }
);

export type WorkspaceDataDeletionPayloadType = z.infer<
  typeof WorkspaceDataDeletionPayloadSchema
>;

export function notifyAdminsSubscriptionCanceled({
  admins,
  ...payload
}: SubscriptionCanceledPayloadType & {
  admins: EmailRecipient[];
}): Promise<Result<void, Error>> {
  return triggerEmailWorkflow({
    workflowId: SUBSCRIPTION_CANCELED_TRIGGER_ID,
    recipients: admins,
    payload,
  });
}

export function notifyAdminsSubscriptionReactivated({
  admins,
  ...payload
}: SubscriptionReactivatedPayloadType & {
  admins: EmailRecipient[];
}): Promise<Result<void, Error>> {
  return triggerEmailWorkflow({
    workflowId: SUBSCRIPTION_REACTIVATED_TRIGGER_ID,
    recipients: admins,
    payload,
  });
}

export function notifyAdminsSubscriptionPaymentFailed({
  admins,
  ...payload
}: SubscriptionPaymentFailedPayloadType & {
  admins: EmailRecipient[];
}): Promise<Result<void, Error>> {
  return triggerEmailWorkflow({
    workflowId: SUBSCRIPTION_PAYMENT_FAILED_TRIGGER_ID,
    recipients: admins,
    payload,
  });
}

export function notifyAdminsWorkspaceDataDeletion({
  admins,
  ...payload
}: WorkspaceDataDeletionPayloadType & {
  admins: EmailRecipient[];
}): Promise<Result<void, Error>> {
  return triggerEmailWorkflow({
    workflowId: WORKSPACE_DATA_DELETION_TRIGGER_ID,
    recipients: admins,
    payload,
  });
}
