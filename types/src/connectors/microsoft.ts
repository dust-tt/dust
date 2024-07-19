import { ModelId } from "../shared/model_id";

export function microsoftIncrementalSyncWorkflowId(connectorId: ModelId) {
  return `microsoft-incrementalSync-${connectorId}`;
}
