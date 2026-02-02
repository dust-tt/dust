import { proxyActivities } from "@temporalio/workflow";

import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/project_journal_queue/activities";

const { generateProjectJournalEntryActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "15 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

export async function generateProjectJournalEntryWorkflow(
  authType: AuthenticatorType,
  {
    spaceId,
  }: {
    spaceId: string;
  }
): Promise<void> {
  await generateProjectJournalEntryActivity(authType, { spaceId });
}
