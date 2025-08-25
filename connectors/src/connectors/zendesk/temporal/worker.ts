import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

import { ZendeskCastKnownErrorsInterceptor } from "@connectors/connectors/zendesk/temporal/cast_known_errors";
import { getTemporalWorkerConnection } from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";

import * as activities from "./activities";
import { QUEUE_NAME } from "./config";
import * as gc_activities from "./gc_activities";
import * as incremental_activities from "./incremental_activities";

export async function runZendeskWorkers() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const syncWorker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: { ...activities, ...incremental_activities, ...gc_activities },
    taskQueue: QUEUE_NAME,
    connection,
    reuseV8Context: true,
    namespace,
    maxConcurrentActivityTaskExecutions: 16,
    interceptors: {
      activity: [
        (ctx: Context) => ({
          inbound: new ActivityInboundLogInterceptor(ctx, logger, "zendesk"),
        }),
        () => ({
          inbound: new ZendeskCastKnownErrorsInterceptor(),
        }),
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
}
