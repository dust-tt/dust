import type { ConnectorResource } from "@connectors/resources/connector_resource";

export function getIntercomFullSyncWorkflowId(connector: ConnectorResource) {
  return `intercom-full-sync-${connector.id}`;
}

export function makeIntercomHelpCenterScheduleId(
  connector: ConnectorResource
): string {
  return `intercom-help-center-sync-${connector.id}`;
}

export function makeIntercomConversationScheduleId(
  connector: ConnectorResource
): string {
  return `intercom-conversation-sync-${connector.id}`;
}
