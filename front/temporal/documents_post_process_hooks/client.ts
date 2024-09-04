import type { ConnectorProvider } from "@dust-tt/types";

import type { DocumentsPostProcessHookType } from "@app/lib/documents_post_process_hooks/hooks";
import { getTemporalClient } from "@app/lib/temporal";
import { newUpsertSignal } from "@app/temporal/documents_post_process_hooks/signals";
import {
  runPostDeleteHoosWorkflow,
  runPostUpsertHooksWorkflow,
} from "@app/temporal/documents_post_process_hooks/workflows";

const QUEUE_NAME = "post-upsert-hooks-queue"; // TODO: rename to post-process-hooks-queue

export async function launchRunPostUpsertHooksWorkflow(
  workspaceId: string,
  dataSourceId: string,
  documentId: string,
  documentHash: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: DocumentsPostProcessHookType,
  debounceMs: number
) {
  const client = await getTemporalClient();

  await client.workflow.signalWithStart(runPostUpsertHooksWorkflow, {
    args: [
      dataSourceId,
      workspaceId,
      documentId,
      documentHash,
      dataSourceConnectorProvider,
      hookType,
      debounceMs,
    ],
    taskQueue: QUEUE_NAME,
    workflowId: `workflow-run-post-upsert-hooks-${hookType}-${workspaceId}-${dataSourceId}-${documentId}`,
    signal: newUpsertSignal,
    signalArgs: undefined,
  });
}

export async function launchRunPostDeleteHooksWorkflow(
  workspaceId: string,
  dataSourceId: string,
  documentId: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: DocumentsPostProcessHookType
) {
  const client = await getTemporalClient();

  await client.workflow.start(runPostDeleteHoosWorkflow, {
    args: [
      dataSourceId,
      workspaceId,
      documentId,
      dataSourceConnectorProvider,
      hookType,
    ],
    taskQueue: QUEUE_NAME,
    workflowId: `workflow-run-post-delete-hooks-${hookType}-${workspaceId}-${dataSourceId}-${documentId}`,
  });
}
