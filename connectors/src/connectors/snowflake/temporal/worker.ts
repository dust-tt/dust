import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

import * as activities from "@connectors/connectors/snowflake/temporal/activities";
import { QUEUE_NAME } from "@connectors/connectors/snowflake/temporal/config";
import * as sync_status from "@connectors/lib/sync_status";
import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";

export async function runSnowflakeWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: { ...activities, ...sync_status },
    taskQueue: QUEUE_NAME,
    // TODO(SNOWFLAKE) real value
    maxConcurrentActivityTaskExecutions: 4,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    connection,
    reuseV8Context: true,
    namespace,
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
        return config;
      },
    },
  });

  await worker.run();
}
