import { getNotionWorkflowId, removeNulls } from "@dust-tt/types";
import type { Client, WorkflowHandle } from "@temporalio/client";

import { getTemporalConnectorsNamespaceConnection } from "@app/lib/temporal";
import type { CheckFunction } from "@app/production_checks/types/check";

const GLOBAL_WORKFLOW_IDS = ["warn_expiring_enterprise_subscriptions"];

export const checkGlobalWorkflowsActive: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const client = await getTemporalConnectorsNamespaceConnection();

  logger.info(`Checking workflows: ${GLOBAL_WORKFLOW_IDS.join(", ")}`);

  const missingWorkflows = removeNulls(
    await Promise.all(
      GLOBAL_WORKFLOW_IDS.map(async (id) => {
        const { status } = await client.workflow.getHandle(id).describe();
        return status.name !== "RUNNING" ? id : null;
      })
    )
  );

  if (missingWorkflows.length > 0) {
    reportFailure({ missingWorkflows }, "Missing Global workflows");
  } else {
    reportSuccess({});
  }
};
