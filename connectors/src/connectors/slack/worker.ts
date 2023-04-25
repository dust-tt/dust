import { Worker } from "@temporalio/worker";

import * as activities from "./slack.js";

export async function runSlackWorker(): Promise<void> {
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflow"),
    activities,
    taskQueue: "slack-sync",
  });
  await worker.run();

  return;
}
