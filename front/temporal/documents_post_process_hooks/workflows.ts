import type { ConnectorProvider } from "@dust-tt/types";
import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";

import type { DocumentsPostProcessHookType } from "@app/lib/documents_post_process_hooks/hooks";
import type * as activities from "@app/temporal/documents_post_process_hooks/activities";

import { newUpsertSignal } from "./signals";

const { runPostUpsertHookActivity, runPostDeleteHookActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "60 minute",
  });

export async function runPostUpsertHooksWorkflow(
  workspaceId: string,
  dataSourceId: string,
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
      workspaceId,
      dataSourceId,
      documentId,
      documentHash,
      dataSourceConnectorProvider,
      hookType
    );
  }
}

export async function runPostDeleteHoosWorkflow(
  workspaceId: string,
  dataSourceId: string,
  documentId: string,
  dataSourceConnectorProvider: ConnectorProvider | null,
  hookType: DocumentsPostProcessHookType
) {
  await runPostDeleteHookActivity(
    workspaceId,
    dataSourceId,
    documentId,
    dataSourceConnectorProvider,
    hookType
  );
}
