import { WorkflowNotFoundError } from "@temporalio/client";

import { getTemporalClient } from "@connectors/lib/temporal";
import type { ModelId } from "@connectors/types";

export async function isGoogleDriveFullSyncRunning(
  connectorId: ModelId
): Promise<boolean> {
  const client = await getTemporalClient();
  const workflowId = `googleDrive-fullSync-${connectorId}`;
  try {
    const handle = client.workflow.getHandle(workflowId);
    const description = await handle.describe();
    return description.status.name === "RUNNING";
  } catch (e) {
    if (e instanceof WorkflowNotFoundError) {
      return false;
    }
    throw e;
  }
}
