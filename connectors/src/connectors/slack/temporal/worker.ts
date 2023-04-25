import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/slack/temporal/activities";
import { getTemporalWorkerConnection } from "@connectors/lib/temporal";

export async function runSlackWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: "slack-queue",
    maxConcurrentActivityTaskExecutions: 1,
    connection,
    namespace,
  });

  await worker.run();
}
