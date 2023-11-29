import { ConnectorProvider } from "@dust-tt/types";

import { DocumentsPostProcessHookType } from "@app/documents_post_process_hooks/hooks";
import { newUpsertSignal } from "@app/documents_post_process_hooks/temporal/signals";
import {
  runPostDeleteHoosWorkflow,
  runPostUpsertHooksWorkflow,
} from "@app/documents_post_process_hooks/temporal/workflows";
import { getTemporalClient } from "@app/lib/temporal";

const QUEUE_NAME = "post-upsert-hooks-queue"; // TODO: rename to post-process-hooks-queue

export async function launchRunPostUpsertHooksWorkflow(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  documentHash: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: DocumentsPostProcessHookType,
  debounceMs: number
) {
  const client = await getTemporalClient();

  await client.workflow.signalWithStart(runPostUpsertHooksWorkflow, {
    args: [
      dataSourceName,
      workspaceId,
      documentId,
      documentHash,
      dataSourceConnectorProvider,
      hookType,
      debounceMs,
    ],
    taskQueue: QUEUE_NAME,
    workflowId: `workflow-run-post-upsert-hooks-${hookType}-${workspaceId}-${dataSourceName}-${documentId}`,
    signal: newUpsertSignal,
    signalArgs: undefined,
  });
}

export async function launchRunPostDeleteHooksWorkflow(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: DocumentsPostProcessHookType
) {
  const client = await getTemporalClient();

  await client.workflow.start(runPostDeleteHoosWorkflow, {
    args: [
      dataSourceName,
      workspaceId,
      documentId,
      dataSourceConnectorProvider,
      hookType,
    ],
    taskQueue: QUEUE_NAME,
    workflowId: `workflow-run-post-delete-hooks-${hookType}-${workspaceId}-${dataSourceName}-${documentId}`,
  });
}
