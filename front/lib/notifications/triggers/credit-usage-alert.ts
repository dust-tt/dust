import type { EmailRecipient } from "@app/lib/notifications/transactional_emails";
import { triggerEmailWorkflow } from "@app/lib/notifications/transactional_emails";
import { CREDIT_USAGE_ALERT_TRIGGER_ID } from "@app/types/notification_preferences";
import type { Result } from "@app/types/shared/result";
import { z } from "zod";

export const CreditUsageAlertPayloadSchema = z.object({
  workspaceId: z.string(),
  workspaceName: z.string(),
  percentUsed: z.number(),
  totalInitialMicroUsd: z.number(),
  totalConsumedMicroUsd: z.number(),
});

export type CreditUsageAlertPayloadType = z.infer<
  typeof CreditUsageAlertPayloadSchema
>;

export function notifyAdminsCreditUsageAlert({
  admins,
  ...payload
}: CreditUsageAlertPayloadType & {
  admins: EmailRecipient[];
}): Promise<Result<void, Error>> {
  return triggerEmailWorkflow({
    workflowId: CREDIT_USAGE_ALERT_TRIGGER_ID,
    recipients: admins,
    payload,
  });
}
