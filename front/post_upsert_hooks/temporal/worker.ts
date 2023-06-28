import { Worker } from "@temporalio/worker";

import * as activities from "@app/post_upsert_hooks/temporal/activities";
import { getTemporalWorkerConnection } from "@app/post_upsert_hooks/temporal/lib";

export async function runPostUpsertHooksWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: "post-upsert-hooks-queue",
    connection,
    namespace,
    // TODO: interceptors, temporal monitoring
  });

  await worker.run();
}
