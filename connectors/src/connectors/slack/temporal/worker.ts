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

import { QUEUE_NAME } from "./config";

export async function runSlackWorker() {
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
      activity: [
        (ctx: Context) => ({
          inbound: new ActivityInboundLogInterceptor(ctx, logger, "slack"),
        }),
        () => ({
          inbound: new SlackCastKnownErrorsInterceptor(),
        }),
      ],
    },
  });

  await worker.run();
}
