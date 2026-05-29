import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/invitation_reminders/activities";
import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import { QUEUE_NAME } from "./config";

export async function runInvitationRemindersWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();

  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "invitation_reminders",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: QUEUE_NAME,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    maxConcurrentActivityTaskExecutions: 4,
    connection,
    namespace,
    interceptors: {
      activity: [
        (ctx: Context) => ({
          inbound: new ActivityInboundLogInterceptor(ctx, logger),
        }),
      ],
    },
  });

  await worker.run();
}
