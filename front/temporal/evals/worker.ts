import { TEMPORAL_MAXED_CACHED_WORKFLOWS } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import { getTemporalWorkerConnection } from "@app/lib/temporal_worker";
import logger from "@app/logger/logger";
import {
  createTemporalWorker,
  getWorkflowConfig,
} from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/evals/activities";
import { QUEUE_NAME } from "@app/temporal/evals/config";
import type { Context } from "@temporalio/activity";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

// Must match the deployment's terminationGracePeriodSeconds minus 10s buffer.
const SHUTDOWN_GRACE_TIME_MS = 70 * 1_000;

export async function runEvalsWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await createTemporalWorker({
    ...getWorkflowConfig({
      workerName: "evals",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: QUEUE_NAME,
    connection,
    maxConcurrentActivityTaskExecutions: 16,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    namespace,
    shutdownGraceTime: SHUTDOWN_GRACE_TIME_MS,
    interceptors: {
      activity: [
        (ctx: Context) => {
          return {
            inbound: new ActivityInboundLogInterceptor(ctx, logger),
          };
        },
      ],
    },
    bundlerOptions: {
      // Update the webpack config to use aliases from our tsconfig.json.
      webpackConfigHook: (config) => {
        const plugins = config.resolve?.plugins ?? [];

        config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
        return config;
      },
    },
  });

  await worker.run();
}
