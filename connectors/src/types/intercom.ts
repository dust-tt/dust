import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

export function getIntercomFullSyncWorkflowId(connectorId: ModelId) {
  return `intercom-full-sync-${connectorId}`;
}

export function makeIntercomHelpCenterScheduleId(
  connector: ConnectorResource
): string {
  return `intercom-help-center-schedule-${connector.id}`;
}

export function makeIntercomConversationScheduleId(
  connector: ConnectorResource
): string {
  return `intercom-conversation-schedule-${connector.id}`;
}
