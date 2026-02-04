import * as activities from "@connectors/connectors/dust_project/temporal/activities";
import { QUEUE_NAME } from "@connectors/connectors/dust_project/temporal/config";
import * as sync_status from "@connectors/lib/sync_status";
import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";
import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

export async function runDustProjectWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: { ...activities, ...sync_status },
    taskQueue: QUEUE_NAME,
    maxConcurrentActivityTaskExecutions: 5,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    connection,
    reuseV8Context: true,
    namespace,
    interceptors: {
      activity: [
        (ctx: Context) => ({
          inbound: new ActivityInboundLogInterceptor(
            ctx,
            logger,
            "dust_project"
          ),
        }),
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
