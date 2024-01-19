import type { ModelId } from "@dust-tt/types";
import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/intercom/temporal/activities";

// This is how to import your activities.
const { syncHelpCentersActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

const { saveIntercomConnectorStartSync, saveIntercomConnectorSuccessSync } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
  });

/**
 * Workflow that syncs all help centers for a given connector:
 * Inside a Help Center, we sync the Collections and the Articles.
 */
export async function intercomHelpCentersSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  await saveIntercomConnectorStartSync({ connectorId });
  await syncHelpCentersActivity({
    connectorId,
  });
  await saveIntercomConnectorSuccessSync({ connectorId });
}
