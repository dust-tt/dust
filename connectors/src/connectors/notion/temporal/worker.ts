import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/notion/temporal/activities";
import { getTemporalWorkerConnection } from "@connectors/lib/temporal";

export async function runNotionWorker() {
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: "notion-queue",
    maxConcurrentActivityTaskExecutions: 3,
    connection: await getTemporalWorkerConnection(),
  });

  await worker.run();
}
