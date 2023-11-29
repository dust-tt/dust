import { ConnectorProvider } from "@dust-tt/types";
import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";

import type { DocumentsPostProcessHookType } from "@app/documents_post_process_hooks/hooks";
import type * as activities from "@app/documents_post_process_hooks/temporal/activities";

import { newUpsertSignal } from "./signals";

const { runPostUpsertHookActivity, runPostDeleteHookActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "60 minute",
  });

export async function runPostUpsertHooksWorkflow(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  documentHash: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: DocumentsPostProcessHookType,
  debounceMs: number
) {
  let signaled = false;

  setHandler(newUpsertSignal, () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;

    await sleep(debounceMs);
    if (signaled) {
      continue;
    }

    await runPostUpsertHookActivity(
      dataSourceName,
      workspaceId,
      documentId,
      documentHash,
      dataSourceConnectorProvider,
      hookType
    );
  }
}

export async function runPostDeleteHoosWorkflow(
  dataSourceName: string,
  workspaceId: string,
  documentId: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: DocumentsPostProcessHookType
) {
  await runPostDeleteHookActivity(
    dataSourceName,
    workspaceId,
    documentId,
    dataSourceConnectorProvider,
    hookType
  );
}
