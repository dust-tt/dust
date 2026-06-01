import type * as activities from "@app/temporal/membership_invitations/activities";
import { proxyActivities } from "@temporalio/workflow";

const { sendInvitationReminderBatchActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
  heartbeatTimeout: "1 minute",
});

export async function invitationRemindersWorkflow(): Promise<void> {
  // Each activity call fetches and processes one batch. Loop until no more eligible invitations.
  while (await sendInvitationReminderBatchActivity()) {
    // continue
  }
}
