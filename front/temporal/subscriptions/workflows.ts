import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/subscriptions/activities";

const { warnExpiringEnterpriseSubscriptionsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "1 hour",
  heartbeatTimeout: "5 minutes",
});

export async function warnExpiringEnterpriseSubscriptionsWorkflow() {
  await warnExpiringEnterpriseSubscriptionsActivity();
}
