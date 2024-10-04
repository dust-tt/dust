import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

import * as activities from "@connectors/connectors/notion/temporal/activities";
import { NotionCastKnownErrorsInterceptor } from "@connectors/connectors/notion/temporal/cast_known_errors";
import {
  GARBAGE_COLLECT_QUEUE_NAME,
  QUEUE_NAME,
} from "@connectors/connectors/notion/temporal/config";
import { getTemporalWorkerConnection } from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";

export async function runNotionWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows/index"),
    activities,
    taskQueue: QUEUE_NAME,
    connection,
    reuseV8Context: true,
    namespace,
    maxConcurrentActivityTaskExecutions: 24,
    maxCachedWorkflows: 200,
    interceptors: {
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
        },
        () => new NotionCastKnownErrorsInterceptor(),
      ],
    },
    bundlerOptions: {
      // Update the webpack config to use aliases from our tsconfig.json.
      webpackConfigHook: (config) => {
        const plugins = config.resolve?.plugins ?? [];
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
        return config;
      },
    },
  });

  await worker.run();
}

export async function runNotionGarbageCollectWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows/index"),
    activities,
    taskQueue: GARBAGE_COLLECT_QUEUE_NAME,
    connection,
    reuseV8Context: true,
    namespace,
    maxConcurrentActivityTaskExecutions: 24,
    maxCachedWorkflows: 200,
    interceptors: {
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
        },
        () => new NotionCastKnownErrorsInterceptor(),
      ],
    },
    bundlerOptions: {
      // Update the webpack config to use aliases from our tsconfig.json.
      webpackConfigHook: (config) => {
        const plugins = config.resolve?.plugins ?? [];
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
        return config;
      },
    },
  });

  await worker.run();
}
