import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";

export function makeLabsConnectionWorkflowId(
  connectionConfiguration: LabsConnectionsConfigurationResource
): string {
  return `labs-connection-sync-${connectionConfiguration.id}`;
}
