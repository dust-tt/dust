import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/credit_alerts/activities";

const { sendCreditAlertEmailActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export interface CreditAlertWorkflowArgs {
  workspaceId: string;
  totalInitialCents: number;
  totalConsumedCents: number;
}

export async function creditAlertWorkflow({
  workspaceId,
  totalInitialCents,
  totalConsumedCents,
}: CreditAlertWorkflowArgs): Promise<void> {
  await sendCreditAlertEmailActivity({
    workspaceId,
    totalInitialMicroUsd: totalInitialCents,
    totalConsumedMicroUsd: totalConsumedCents,
  });
}
