import { ConnectorProvider } from "@app/lib/connectors_api";
import { getTemporalClient } from "@app/post_upsert_hooks/temporal/lib";
import { newUpsertSignal } from "@app/post_upsert_hooks/temporal/signals";
import {
  runOnDeleteWorkflow,
  runPostUpsertHooksWorkflow,
} from "@app/post_upsert_hooks/temporal/workflows";

import { PostUpsertHookType } from "../hooks";

export async function launchRunPostUpsertHooksWorkflow(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  documentHash: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: PostUpsertHookType,
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
    taskQueue: "post-upsert-hooks-queue",
    workflowId: `workflow-run-post-upsert-hooks-${hookType}-${workspaceId}-${dataSourceName}-${documentId}`,
    signal: newUpsertSignal,
    signalArgs: undefined,
  });
}

export async function launchRunOnDeleteWorkflow(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: PostUpsertHookType
) {
  const client = await getTemporalClient();

  await client.workflow.execute(runOnDeleteWorkflow, {
    args: [
      dataSourceName,
      workspaceId,
      documentId,
      dataSourceConnectorProvider,
      hookType,
    ],
    taskQueue: "post-upsert-hooks-queue",
    workflowId: `workflow-run-on-delete-${hookType}-${workspaceId}-${dataSourceName}-${documentId}`,
  });
}
