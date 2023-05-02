import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/notion/temporal/activities";
import { getTemporalWorkerConnection } from "@connectors/lib/temporal";

export async function runNotionWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: "notion-queue-v2",
    maxConcurrentActivityTaskExecutions: 3,
    connection,
    namespace,
  });

  await worker.run();
}
