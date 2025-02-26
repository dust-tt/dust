import { isDevelopment } from "@dust-tt/types";
import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import * as activities from "@connectors/connectors/github/temporal/activities";
import { GithubCastKnownErrorsInterceptor } from "@connectors/connectors/github/temporal/cast_known_errors";
import { QUEUE_NAME } from "@connectors/connectors/github/temporal/config";
import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@connectors/lib/temporal";
import { ActivityInboundLogInterceptor } from "@connectors/lib/temporal_monitoring";
import logger from "@connectors/logger/logger";

export async function runGithubWorker() {
  if (
    !isDevelopment() &&
    (!process.env.PROXY_HOST ||
      !process.env.PROXY_PORT ||
      !process.env.PROXY_USER_NAME ||
      !process.env.PROXY_PASSWORD)
  ) {
    throw new Error("Proxy environment variables are not set");
  }

  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities,
    taskQueue: QUEUE_NAME,
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
