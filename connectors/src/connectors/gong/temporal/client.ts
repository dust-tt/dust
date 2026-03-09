import { QUEUE_NAME } from "@connectors/connectors/gong/temporal/config";
import {
  gongKeywordUpdateWorkflow,
  updateExcludedKeywordsSignal,
} from "@connectors/connectors/gong/temporal/workflows";
import { getTemporalClient } from "@connectors/lib/temporal";
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
  newKeywords: string[],
  maxTranscriptId: number
): Promise<Result<string, Error>> {
  const client = await getTemporalClient();
  const workflowId = makeGongKeywordUpdateWorkflowId(connector);

  await client.workflow.signalWithStart(gongKeywordUpdateWorkflow, {
    args: [{ connectorId: connector.id, newKeywords, maxTranscriptId }],
    signal: updateExcludedKeywordsSignal,
    signalArgs: [{ newKeywords, maxTranscriptId }],
    taskQueue: QUEUE_NAME,
    workflowId,
    searchAttributes: { connectorId: [connector.id] },
    memo: { connectorId: connector.id },
  });

  return new Ok(workflowId);
}
