import { getTemporalClient } from "@app/lib/temporal";

import { sendFreeTrialReminderEmails } from "./workflows";

export async function launchSendFreeTrialReminderEmailsWorkflow({
  workspaceId,
  trialPeriodDays,
}: {
  workspaceId: string;
  trialPeriodDays: number;
}) {
  const client = await getTemporalClient();

  await client.workflow.start(sendFreeTrialReminderEmails, {
    args: [
      {
        workspaceId,
        trialPeriodDays,
      },
    ],
    taskQueue: "mailing-queue",
    workflowId: `mailing-${workspaceId}-send-free-trial-reminder-emails`,
  });
}
