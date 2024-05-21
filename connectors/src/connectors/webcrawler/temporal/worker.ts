import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/webcrawler/temporal/activities";
import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";

import { WebCrawlerQueueNames } from "./config";

export async function runWebCrawlerWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const workers = await Promise.all([
    Worker.create({
      workflowsPath: require.resolve("./workflows"),
      activities,
      taskQueue: WebCrawlerQueueNames.UPDATE_WEBSITE,
      connection,
      reuseV8Context: true,
      namespace,
      maxConcurrentActivityTaskExecutions: 1,
      maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
      interceptors: {
        activityInbound: [
          (ctx: Context) => {
            return new ActivityInboundLogInterceptor(ctx, logger);
          },
        ],
      },
    }),
    Worker.create({
      workflowsPath: require.resolve("./workflows"),
      activities,
      taskQueue: WebCrawlerQueueNames.NEW_WEBSITE,
      connection,
      reuseV8Context: true,
      namespace,
      maxConcurrentActivityTaskExecutions: 1,
      maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
      interceptors: {
        activityInbound: [
          (ctx: Context) => new ActivityInboundLogInterceptor(ctx, logger),
        ],
      },
    }),
  ]);
  await Promise.all(workers.map((worker) => worker.run()));
}
