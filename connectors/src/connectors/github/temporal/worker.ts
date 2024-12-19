import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/github/temporal/activities";
import { GithubCastKnownErrorsInterceptor } from "@connectors/connectors/github/temporal/cast_known_errors";
import {
  OLD_QUEUE_NAME,
  QUEUE_NAME as NEW_QUEUE_NAME,
} from "@connectors/connectors/github/temporal/config";
import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";

async function runSingleWorker(
  taskQueue: string,
  {
    connection,
    namespace,
  }: Awaited<ReturnType<typeof getTemporalWorkerConnection>>
) {
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue,
    maxConcurrentActivityTaskExecutions: 16,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    connection,
    reuseV8Context: true,
    namespace,
    interceptors: {
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
        },
        () => new GithubCastKnownErrorsInterceptor(),
      ],
    },
  });

  await worker.run();
}

export async function runGithubWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();

  await Promise.all([
    runSingleWorker(OLD_QUEUE_NAME, { connection, namespace }),
    runSingleWorker(NEW_QUEUE_NAME, { connection, namespace }),
  ]);
}
