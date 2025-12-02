import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";

import type * as activities from "@app/temporal/es_indexation/activities";

import { indexUserSearchSignal } from "./signals";

const DEBOUNCE_DELAY_MS = 1_000;

const { indexUserSearchActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export async function indexUserSearchWorkflow({
  userId,
}: {
  userId: string;
}): Promise<void> {
  let signaled = false;

  setHandler(indexUserSearchSignal, async () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(DEBOUNCE_DELAY_MS);
    if (signaled) {
      continue;
    }

    await indexUserSearchActivity({ userId });
  }

  // /!\ Any signal received outside of the while loop will be lost, so don't make any async call
  // here, which will allow the signal handler to be executed by the nodejs event loop.
}
