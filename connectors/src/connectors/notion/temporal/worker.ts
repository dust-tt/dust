import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/notion/temporal/activities";

async function run() {
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: "notion-queue",
    maxConcurrentActivityTaskExecutions: 3,
  });

  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
