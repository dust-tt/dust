import { proxyActivities } from "@temporalio/workflow";

import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/project_user_digest_queue/activities";

const { generateUserProjectDigestActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "15 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

export async function generateUserProjectDigestWorkflow(
  authType: AuthenticatorType,
  {
    spaceId,
  }: {
    spaceId: string;
  }
): Promise<void> {
  await generateUserProjectDigestActivity(authType, { spaceId });
}
