import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import { markSandboxFunctionInvocationFailedActivity } from "@app/temporal/sandbox_functions/activities/mark_sandbox_function_invocation_failed";
import { runSandboxFunctionInvocationActivity } from "@app/temporal/sandbox_functions/activities/run_sandbox_function_invocation";
import { runSandboxFunctionToolActivity } from "@app/temporal/sandbox_functions/activities/run_sandbox_function_tool";
import {
  LEGACY_QUEUE_NAME,
  QUEUE_NAME,
} from "@app/temporal/sandbox_functions/config";
import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

// Must match the deployment's terminationGracePeriodSeconds minus 10s buffer.
const SHUTDOWN_GRACE_TIME_MS = 70 * 1_000;

async function createSandboxFunctionsWorker({
  maxConcurrentActivityTaskExecutions,
  taskQueue,
}: {
  maxConcurrentActivityTaskExecutions: number;
  taskQueue: string;
}) {
  const { connection, namespace } = await getTemporalWorkerConnection();

  return Worker.create({
    ...getWorkflowConfig({
      workerName: "sandbox_functions",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities: {
      markSandboxFunctionInvocationFailedActivity,
      runSandboxFunctionInvocationActivity,
      runSandboxFunctionToolActivity,
    },
    taskQueue,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    maxConcurrentActivityTaskExecutions,
    connection,
    namespace,
    shutdownGraceTime: SHUTDOWN_GRACE_TIME_MS,
    interceptors: {
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
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
}

export async function runSandboxFunctionsWorker() {
  // New invocations are sent to the current queue. Keep polling the previous
  // queue so workflows started before the rollout can drain without letting
  // an old worker consume payloads written by the new release.
  const [currentWorker, legacyWorker] = await Promise.all([
    createSandboxFunctionsWorker({
      maxConcurrentActivityTaskExecutions: 16,
      taskQueue: QUEUE_NAME,
    }),
    createSandboxFunctionsWorker({
      maxConcurrentActivityTaskExecutions: 4,
      taskQueue: LEGACY_QUEUE_NAME,
    }),
  ]);

  await Promise.all([currentWorker.run(), legacyWorker.run()]);
}
