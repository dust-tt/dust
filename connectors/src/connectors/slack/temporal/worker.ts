import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/slack/temporal/activities";
import { SlackCastKnownErrorsInterceptor } from "@connectors/connectors/slack/temporal/cast_known_errors";
import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";

import { QUEUE_NAME, SLOW_QUEUE_NAME } from "./config";

export async function runSlackWorker() {
  // Start both normal and slow lane workers in the same deployment
  // This keeps things simple - both workers run together when "slack" is started
  const promises = [runSlackNormalWorker(), runSlackSlowWorker()];

  await Promise.all(promises);
}

async function runSlackNormalWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: QUEUE_NAME,
    connection,
    reuseV8Context: true,
    namespace,
    maxConcurrentActivityTaskExecutions: 16,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    interceptors: {
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
        },
        () => new SlackCastKnownErrorsInterceptor(),
      ],
    },
  });

  await worker.run();
}

async function runSlackSlowWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: SLOW_QUEUE_NAME,
    connection,
    reuseV8Context: true,
    namespace,
    maxConcurrentActivityTaskExecutions: 4, // Lower concurrency for slow lane.
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    interceptors: {
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
        },
        () => new SlackCastKnownErrorsInterceptor(),
      ],
    },
  });

  await worker.run();
}
