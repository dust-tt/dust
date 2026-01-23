import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/remote_tools/activities";
import { QUEUE_NAME } from "@app/temporal/remote_tools/config";

export async function runRemoteToolsSyncWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "remote_tools_sync",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: QUEUE_NAME,
    connection,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    namespace,
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
