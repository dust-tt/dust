import type { ConnectorProvider } from "@dust-tt/types";

import { getTemporalClient } from "@app/lib/temporal";
import { QUEUE_NAME } from "@app/temporal/document_tracker/config";

import { newUpsertSignal } from "./signals";
import { runDocumentTrackerWorkflow } from "./workflows";

export async function launchRunDocumentTrackerWorkflow({
  workspaceId,
  dataSourceId,
  documentId,
  documentHash,
  dataSourceConnectorProvider,
}: {
  workspaceId: string;
  dataSourceId: string;
  documentId: string;
  documentHash: string;
  dataSourceConnectorProvider: ConnectorProvider | null;
}) {
  const client = await getTemporalClient();

  await client.workflow.signalWithStart(runDocumentTrackerWorkflow, {
    args: [
      workspaceId,
      dataSourceId,
      documentId,
      documentHash,
      dataSourceConnectorProvider,
    ],
    taskQueue: QUEUE_NAME,
    workflowId: `workflow-run-document-tracker-${workspaceId}-${dataSourceId}-${documentId}`,
    signal: newUpsertSignal,
    signalArgs: undefined,
  });
}
