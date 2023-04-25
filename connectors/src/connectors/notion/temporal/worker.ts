import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/notion/temporal/activities";

export async function runNotionWorker() {
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: "notion-queue",
    maxConcurrentActivityTaskExecutions: 3,
  });

  await worker.run();
}
