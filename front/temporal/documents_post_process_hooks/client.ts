import type { ConnectorProvider } from "@dust-tt/types";

import type { DocumentsPostProcessHookType } from "@app/lib/documents_post_process_hooks/hooks";

export async function launchRunPostUpsertHooksWorkflow(
  workspaceId: string,
  dataSourceId: string,
  documentId: string,
  documentHash: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: DocumentsPostProcessHookType,
  debounceMs: number
) {
  void workspaceId;
  void dataSourceId;
  void documentId;
  void documentHash;
  void dataSourceConnectorProvider;
  void hookType;
  void debounceMs;

  // const client = await getTemporalClient();
  // await client.workflow.signalWithStart(runPostUpsertHooksWorkflow, {
  //   args: [
  //     workspaceId,
  //     dataSourceId,
  //     documentId,
  //     documentHash,
  //     dataSourceConnectorProvider,
  //     hookType,
  //     debounceMs,
  //   ],
  //   taskQueue: QUEUE_NAME,
  //   workflowId: `workflow-run-post-upsert-hooks-${hookType}-${workspaceId}-${dataSourceId}-${documentId}`,
  //   signal: newUpsertSignal,
  //   signalArgs: undefined,
  // });
}

export async function launchRunPostDeleteHooksWorkflow(
  workspaceId: string,
  dataSourceId: string,
  documentId: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: DocumentsPostProcessHookType
) {
  void workspaceId;
  void dataSourceId;
  void documentId;
  void dataSourceConnectorProvider;
  void hookType;

  // const client = await getTemporalClient();

  // await client.workflow.start(runPostDeleteHoosWorkflow, {
  //   args: [
  //     dataSourceId,
  //     workspaceId,
  //     documentId,
  //     dataSourceConnectorProvider,
  //     hookType,
  //   ],
  //   taskQueue: QUEUE_NAME,
  //   workflowId: `workflow-run-post-delete-hooks-${hookType}-${workspaceId}-${dataSourceId}-${documentId}`,
  // });
}
