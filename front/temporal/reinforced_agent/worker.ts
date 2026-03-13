import { initializeOpenTelemetryInstrumentation } from "@app/lib/api/instrumentation/init";
import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/reinforced_agent/activities";
import type { Context } from "@temporalio/activity";
import {
  OpenTelemetryActivityInboundInterceptor,
  OpenTelemetryActivityOutboundInterceptor,
} from "@temporalio/interceptors-opentelemetry/lib/worker";
import { Worker } from "@temporalio/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

import { QUEUE_NAME } from "./config";

export async function runReinforcedAgentWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();

  initializeOpenTelemetryInstrumentation({
    serviceName: "dust-reinforced-agent",
  });

  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "reinforced_agent",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: QUEUE_NAME,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    maxConcurrentActivityTaskExecutions: 8,
    connection,
    namespace,
    bundlerOptions: {
      // Update the webpack config to use aliases from our tsconfig.json. This let us import code
      // in the workflows and activities files using the @app/ prefix.
      // In particular, it let us used concurrentExecutor
      webpackConfigHook: (config) => {
        const plugins = config.resolve?.plugins ?? [];

        config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
        return config;
      },
      // We need to ignore some modules that are not available in Temporal environment.
      ignoreModules: ["child_process", "crypto", "stream"],
    },
    interceptors: {
      activity: [
        (ctx: Context) => {
          return {
            inbound: new ActivityInboundLogInterceptor(ctx, logger),
          };
        },
        (ctx) => ({
          inbound: new OpenTelemetryActivityInboundInterceptor(ctx),
          outbound: new OpenTelemetryActivityOutboundInterceptor(ctx),
        }),
      ],
    },
  });

  await worker.run();
}
