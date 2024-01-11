import { ModelId } from "@dust-tt/types";

import { DataSourceInfo } from "@connectors/types/data_source_config";

// Changes made here should be reflected in the production environment checks.
export function getWorkflowId(dataSourceInfo: DataSourceInfo) {
  return `workflow-notion-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}`;
}

export function getWorkflowIdV2(connectorId: ModelId) {
  return `notion-${connectorId}`;
}
