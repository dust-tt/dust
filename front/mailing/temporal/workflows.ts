import { proxyActivities, sleep } from "@temporalio/workflow";

import type * as activities from "@app/mailing/temporal/activities";

const activityProxies = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minute",
  retry: {
    // We don't want to retry these activities, as we would risk
    // sending the same email multiple times.
    // Instead we will monitor failed workflows.
    maximumAttempts: 1,
  },
});

const { sendFirstReminderEmail, sendSecondReminderEmail } = activityProxies;

export async function sendFreeTrialReminderEmails({
  workspaceId,
  trialPeriodDays,
}: {
  workspaceId: string;
  trialPeriodDays: number;
}) {
  // First email is sent at 50% of the trial period.
  const firstReminderDelay = 1000 * 60 * 60 * 24 * (trialPeriodDays / 2);
  // Wait a week before sending the first reminder.
  await sleep(1000 * 60 * 60 * 24 * firstReminderDelay);
  await sendFirstReminderEmail({ workspaceId });
  // Send the second reminder 3 days before the trial ends.
  const secondReminderDelay = 1000 * 60 * 60 * 24 * (trialPeriodDays - 3);
  await sleep(firstReminderDelay - secondReminderDelay);
  await sendSecondReminderEmail({ workspaceId });
}
