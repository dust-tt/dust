import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";

import type * as activities from "@app/post_upsert_hooks/temporal/activities";

import { newUpsertSignal } from "./signals";

const { runPostUpsertHookActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});
const { getPostUpsertHooksToRunActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minute",
});

export async function runPostUpsertHooksWorkflow(
  dataSourceName: string,
  workspaceId: string,
  documentId: string
) {
  let signaled = false;

  setHandler(newUpsertSignal, () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    // TODO: maybe a bit more ?
    await sleep(10000);
    if (signaled) {
      continue;
    }
    const hooksToRun = await getPostUpsertHooksToRunActivity(
      dataSourceName,
      workspaceId,
      documentId
    );
    for (const hookType of hooksToRun) {
      await runPostUpsertHookActivity(
        dataSourceName,
        workspaceId,
        documentId,
        hookType
      );
    }
  }
}
