import type {
  ActivityInterfaceFor,
  ActivityOptions,
} from "@temporalio/workflow";
import { workflowInfo } from "@temporalio/workflow";
import { proxyActivities } from "@temporalio/workflow";

// Helper to build slow lane queue name from base queue name.
export function makeSlowQueueName(baseQueueName: string): string {
  return baseQueueName.replace(/(-queue-v\d+)$/, `-slow$1`);
}

// Workflow-level utilities for dynamic queue routing.
function shouldUseSlowLane({
  connectorId,
  slowLaneConnectorIds,
}: {
  connectorId: string;
  slowLaneConnectorIds: string[];
}): boolean {
  return slowLaneConnectorIds.includes(connectorId);
}

// Extract connector ID from workflow's search attributes.
export function getConnectorIdFromWorkflow(): string | null {
  const info = workflowInfo();
  const searchAttributes = info.searchAttributes;

  if (searchAttributes && searchAttributes.connectorId) {
    const connectorIdArray = searchAttributes.connectorId;
    if (Array.isArray(connectorIdArray) && connectorIdArray.length > 0) {
      return String(connectorIdArray[0]);
    }
  }

  return null;
}

// Create activity proxy with dynamic task queue routing (following relocation pattern).
function getActivitiesForLane<T>({
  activityOptions,
  baseQueue,
  useSlowLane,
}: {
  activityOptions: ActivityOptions;
  baseQueue: string;
  useSlowLane: boolean;
}): ActivityInterfaceFor<T> {
  const taskQueue = useSlowLane ? makeSlowQueueName(baseQueue) : baseQueue;

  return proxyActivities<T>({
    taskQueue,
    ...activityOptions,
  });
}

// Determine which lane to use for a connector.
export function getActivitiesForConnector<T>({
  baseQueue,
  connectorId,
  slowLaneConnectorIds,
  activityOptions,
}: {
  baseQueue: string;
  connectorId: string | null;
  slowLaneConnectorIds: string[];
  activityOptions: ActivityOptions;
}): ActivityInterfaceFor<T> {
  const useSlowLane = connectorId
    ? shouldUseSlowLane({ connectorId, slowLaneConnectorIds })
    : false;

  return getActivitiesForLane<T>({
    activityOptions,
    baseQueue,
    useSlowLane,
  });
}
