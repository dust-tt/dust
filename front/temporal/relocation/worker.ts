import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

import { config } from "@app/lib/api/regions/config";
import { getTemporalWorkerConnection } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { RELOCATION_QUEUES_PER_REGION } from "@app/temporal/relocation/config";
import * as destinationRegionActivities from "@app/temporal/relocation/destination_region_activities";
import * as sourceRegionActivities from "@app/temporal/relocation/source_region_activities";

export async function runRelocationWorker() {
  const currentRegion = config.getCurrentRegion();

  // TODO: We need to use a custom namespace here!
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: { ...sourceRegionActivities, ...destinationRegionActivities },
    taskQueue: RELOCATION_QUEUES_PER_REGION[currentRegion],
    maxConcurrentActivityTaskExecutions: 8,
    connection,
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
