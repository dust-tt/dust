import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

import { getTemporalWorkerConnection } from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";

import * as activities from "./activities";
import { GARBAGE_COLLECT_QUEUE_NAME, QUEUE_NAME } from "./config";

export async function runZendeskWorkers() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const syncWorker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: QUEUE_NAME,
    connection,
    reuseV8Context: true,
    namespace,
    maxConcurrentActivityTaskExecutions: 16,
    interceptors: {
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
        },
      ],
    },
    bundlerOptions: {
      webpackConfigHook: (config) => {
        const plugins = config.resolve?.plugins ?? [];
        config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
        return config;
      },
    },
  });

  await syncWorker.run();

  const gcWorker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: GARBAGE_COLLECT_QUEUE_NAME,
    connection,
    reuseV8Context: true,
    namespace,
    maxConcurrentActivityTaskExecutions: 16,
    interceptors: {
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
        },
      ],
    },
    bundlerOptions: {
      webpackConfigHook: (config) => {
        const plugins = config.resolve?.plugins ?? [];
        config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
        return config;
      },
    },
  });

  await gcWorker.run();
}
