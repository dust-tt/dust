import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

import { config } from "@app/lib/api/regions/config";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import * as connectorsDestinationActivities from "@app/temporal/relocation/activities/destination_region/connectors/sql";
import * as coreDestinationActivities from "@app/temporal/relocation/activities/destination_region/core";
import * as frontDestinationActivities from "@app/temporal/relocation/activities/destination_region/front";
import * as connectorsSourceActivities from "@app/temporal/relocation/activities/source_region/connectors/sql";
import * as coreSourceActivities from "@app/temporal/relocation/activities/source_region/core";
import * as frontSourceActivities from "@app/temporal/relocation/activities/source_region/front";
import { RELOCATION_QUEUES_PER_REGION } from "@app/temporal/relocation/config";
import { getTemporalRelocationWorkerConnection } from "@app/temporal/relocation/temporal";

export async function runRelocationWorker() {
  const currentRegion = config.getCurrentRegion();

  const { connection, namespace } =
    await getTemporalRelocationWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: {
      ...connectorsDestinationActivities,
      ...connectorsSourceActivities,
      ...coreDestinationActivities,
      ...coreSourceActivities,
      ...frontDestinationActivities,
      ...frontSourceActivities,
    },
    taskQueue: RELOCATION_QUEUES_PER_REGION[currentRegion],
    maxConcurrentActivityTaskExecutions: 8,
    connection,
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
        return config;
      },
    },
  });

  await worker.run();
}
