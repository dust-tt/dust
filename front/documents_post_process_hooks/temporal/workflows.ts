import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";

import type { DocumentsPostProcessHookType } from "@app/documents_post_process_hooks/hooks";
import type * as activities from "@app/documents_post_process_hooks/temporal/activities";
import type { ConnectorProvider } from "@app/lib/connectors_api";

import { newUpsertSignal } from "./signals";

const { runPostUpsertHookActivity } = proxyActivities<typeof activities>({
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
