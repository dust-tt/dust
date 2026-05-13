import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as reaperActivities from "@app/temporal/sandbox_reaper/activities";
import { launchSandboxReaperSchedule } from "@app/temporal/sandbox_reaper/client";
import * as killRequesterActivities from "@app/temporal/sandbox_reaper/kill_requester/activities";
import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import { QUEUE_NAME } from "./config";

export async function runSandboxReaperWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "sandbox_reaper",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities: { ...reaperActivities, ...killRequesterActivities },
    taskQueue: QUEUE_NAME,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    connection,
    namespace,
    interceptors: {
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
        },
      ],
    },
  });

  // Start the schedule.
  await launchSandboxReaperSchedule();

  await worker.run();
}
