import { Worker } from "@temporalio/worker";

import { getTemporalWorkerConnection } from "@connectors/lib/temporal";

import * as activities from "./slack.js";

export async function runSlackWorker(): Promise<void> {
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflow"),
    activities,
    taskQueue: "slack-sync",
    connection: await getTemporalWorkerConnection(),
  });
  await worker.run();

  return;
}
