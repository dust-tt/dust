import type { ConnectorProvider } from "@dust-tt/types";
import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";

import type * as activities from "./activities";
import { newUpsertSignal } from "./signals";

const { runDocumentTrackerActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minutes",
});

export async function runDocumentTrackerWorkflow(
  workspaceId: string,
  dataSourceId: string,
  documentId: string,
  documentHash: string,
  dataSourceConnectorProvider: ConnectorProvider | null
) {
  let signaled = true;

  const debounceMs = (() => {
    if (!dataSourceConnectorProvider) {
      return 10000;
    }
    if (dataSourceConnectorProvider === "notion") {
      return 600000;
    }
    return 3600000;
  })();

  setHandler(newUpsertSignal, () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(debounceMs);

    if (signaled) {
      continue;
    }

    await runDocumentTrackerActivity(
      workspaceId,
      dataSourceId,
      documentId,
      documentHash,
      dataSourceConnectorProvider
    );
  }
}
