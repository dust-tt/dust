import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/github/temporal/activities";
import * as activitiesSyncCode from "@connectors/connectors/github/temporal/activities/sync_code";
import { GithubCastKnownErrorsInterceptor } from "@connectors/connectors/github/temporal/cast_known_errors";
import { QUEUE_NAME } from "@connectors/connectors/github/temporal/config";
import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";

export async function runGithubWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();

  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: {
      ...activities,
      ...activitiesSyncCode,
    },
    taskQueue: QUEUE_NAME,
    maxConcurrentActivityTaskExecutions: 16,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    connection,
    reuseV8Context: true,
    namespace,
    interceptors: {
      activity: [
        (ctx: Context) => ({
          inbound: new ActivityInboundLogInterceptor(ctx, logger, "github"),
        }),
        () => ({
          inbound: new GithubCastKnownErrorsInterceptor(),
        }),
      ],
    },
  });

  await worker.run();
}
