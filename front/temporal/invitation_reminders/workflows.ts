import type * as activities from "@app/temporal/invitation_reminders/activities";
import { proxyActivities } from "@temporalio/workflow";

const { sendInvitationReminderBatchActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minutes",
});

export async function invitationRemindersWorkflow(): Promise<void> {
  // Each activity call fetches and processes one batch. Loop until no more eligible invitations.
  while (await sendInvitationReminderBatchActivity()) {
    // continue
  }
}
