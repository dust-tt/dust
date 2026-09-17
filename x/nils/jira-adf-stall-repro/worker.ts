import { getTemporalWorkerConnection } from "@app/lib/temporal_worker";
import { createTemporalWorker, getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as activities from "./activities";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";
import { TASK_QUEUE } from "./config";

// Event-loop lag probe: if the loop is blocked, this interval fires late by
// exactly the blocked duration. Independent of Temporal.
function startEventLoopProbe() {
  const PERIOD = 1000;
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const lag = now - last - PERIOD;
    if (lag > 1000) {
      console.log(`[eventloop] ${new Date().toISOString()} LAG ${lag}ms`);
    }
    last = now;
  }, PERIOD).unref();
}

async function main() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await createTemporalWorker({
    ...getWorkflowConfig({
      workerName: "adf_stall_repro",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: TASK_QUEUE,
    connection,
    namespace,
    // Both activities must be able to run at once in this single process.
    maxConcurrentActivityTaskExecutions: 4,
    bundlerOptions: {
      webpackConfigHook: (config) => {
        const plugins = config.resolve?.plugins ?? [];
        config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
        return config;
      },
    },
  });
  startEventLoopProbe();
  console.log(`[worker] listening on task queue "${TASK_QUEUE}" namespace=${namespace ?? "default"}`);
  await worker.run();
}

void main();
