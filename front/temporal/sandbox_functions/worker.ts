import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import { cleanupRetiredFramePublicationActivity } from "@app/temporal/sandbox_functions/activities/cleanup_retired_frame_publication";
import { markSandboxFunctionInvocationFailedActivity } from "@app/temporal/sandbox_functions/activities/mark_sandbox_function_invocation_failed";
import { runSandboxFunctionInvocationActivity } from "@app/temporal/sandbox_functions/activities/run_sandbox_function_invocation";
import { runSandboxFunctionToolActivity } from "@app/temporal/sandbox_functions/activities/run_sandbox_function_tool";
import { QUEUE_NAME } from "@app/temporal/sandbox_functions/config";
import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

// Must match the deployment's terminationGracePeriodSeconds minus 10s buffer.
const SHUTDOWN_GRACE_TIME_MS = 70 * 1_000;

export async function runSandboxFunctionsWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();

  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "sandbox_functions",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities: {
      cleanupRetiredFramePublicationActivity,
      markSandboxFunctionInvocationFailedActivity,
      runSandboxFunctionInvocationActivity,
      runSandboxFunctionToolActivity,
    },
    taskQueue: QUEUE_NAME,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    maxConcurrentActivityTaskExecutions: 16,
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

  await worker.run();
}
