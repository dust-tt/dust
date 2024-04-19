import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/google_drive/temporal/activities";
import { GoogleDriveCastKnownErrorsInterceptor } from "@connectors/connectors/google_drive/temporal/cast_known_errors";
import * as sync_status from "@connectors/lib/sync_status";
import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";

import { QUEUE_NAME } from "./config";

export async function runGoogleWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: { ...activities, ...sync_status },
    taskQueue: QUEUE_NAME,
    maxConcurrentActivityTaskExecutions: 4,
    connection,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    reuseV8Context: true,
    namespace,
    interceptors: {
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
        },
        () => new GoogleDriveCastKnownErrorsInterceptor(),
      ],
    },
  });

  await worker.run();
}
