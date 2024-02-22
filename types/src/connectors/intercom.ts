import { ModelId } from "../shared/model_id";

export function getIntercomSyncWorkflowId(connectorId: ModelId) {
  return `intercom-sync-${connectorId}`;
}
