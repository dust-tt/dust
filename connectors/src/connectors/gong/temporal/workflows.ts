import type { ModelId } from "@dust-tt/types";
import { setHandler } from "@temporalio/workflow";

import { resyncSignal } from "@connectors/connectors/salesforce/temporal/signals";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function gongSyncWorkflow(_: { connectorId: ModelId }) {
  let signaled = false;

  setHandler(resyncSignal, () => {
    signaled = true;
  });

  do {
    signaled = false;
    // TODO(2025-03-04) - Implement this.
  } while (signaled);
}
