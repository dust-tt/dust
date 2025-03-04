import type { ModelId } from "@dust-tt/types";
import { defineSignal, setHandler } from "@temporalio/workflow";

export interface ResyncSignal {}

export const resyncSignal = defineSignal<ResyncSignal[]>("resyncSignal");

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
