import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/subscriptions/activities";

const { warnExpiringEnterpriseSubscriptionsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "10 minutes",
});

export async function warnExpiringEnterpriseSubscriptionsWorkflow() {
  await warnExpiringEnterpriseSubscriptionsActivity();
}
