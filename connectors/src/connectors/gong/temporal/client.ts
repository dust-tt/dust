import { QUEUE_NAME } from "@connectors/connectors/gong/temporal/config";
import { gongKeywordUpdateWorkflow } from "@connectors/connectors/gong/temporal/workflows";
import {
  getTemporalClient,
  terminateAllWorkflowsForConnectorId,
} from "@connectors/lib/temporal";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { Result } from "@dust-tt/client";
import { Ok } from "@dust-tt/client";

export function makeGongKeywordUpdateWorkflowId(
  connector: ConnectorResource
): string {
  return `gong-keyword-update-${connector.id}`;
}

export async function launchGongKeywordUpdateWorkflow(
  connector: ConnectorResource,
  newKeywords: string[]
): Promise<Result<string, Error>> {
  await terminateAllWorkflowsForConnectorId({
    connectorId: connector.id,
    stopReason: "Excluded keywords updated",
  });

  const client = await getTemporalClient();
  const workflowId = makeGongKeywordUpdateWorkflowId(connector);

  await client.workflow.start(gongKeywordUpdateWorkflow, {
    args: [{ connectorId: connector.id, newKeywords }],
    taskQueue: QUEUE_NAME,
    workflowId,
    searchAttributes: {
      connectorId: [connector.id],
    },
    memo: { connectorId: connector.id },
  });

  return new Ok(workflowId);
}
