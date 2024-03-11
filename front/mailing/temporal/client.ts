import { getTemporalClient } from "@app/lib/temporal";

import { sendFreeTrialReminderEmails } from "./workflows";

export async function launchSendFreeTrialReminderEmailsWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const client = await getTemporalClient();

  await client.workflow.start(sendFreeTrialReminderEmails, {
    args: [
      {
        workspaceId,
      },
    ],
    taskQueue: "mailing-queue",
    workflowId: `mailing-${workspaceId}-send-free-trial-reminder-emails`,
  });
}
