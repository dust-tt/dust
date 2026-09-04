import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import {
  createTemporalWorker,
  getWorkflowConfig,
} from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/model_health/activities";
import type { Context } from "@temporalio/activity";

import { QUEUE_NAME } from "./config";

// Must match the deployment's terminationGracePeriodSeconds minus 10s buffer.
const SHUTDOWN_GRACE_TIME_MS = 70 * 1_000;

export async function runModelHealthWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await createTemporalWorker({
    ...getWorkflowConfig({
      workerName: "model_health",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: QUEUE_NAME,
    connection,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    namespace,
    shutdownGraceTime: SHUTDOWN_GRACE_TIME_MS,
    interceptors: {
      activity: [
        (ctx: Context) => {
          return {
            inbound: new ActivityInboundLogInterceptor(ctx, logger),
          };
        },
      ],
    },
  });

  // No schedule: recovery workflows are started on demand by the pod that
  // detects the breach.
  await worker.run();
}
