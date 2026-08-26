import { TEMPORAL_MAXED_CACHED_WORKFLOWS } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import { getTemporalWorkerConnection } from "@app/lib/temporal_worker";
import logger from "@app/logger/logger";
import * as activities from "@app/temporal/agent_inactivity/activities";
import { launchArchiveInactiveAgentsSchedule } from "@app/temporal/agent_inactivity/client";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

import { QUEUE_NAME } from "./config";

const SHUTDOWN_GRACE_TIME_MS = 70 * 1_000;
const MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS = 2;

export async function runAgentInactivityWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();

  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "agent_inactivity",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: QUEUE_NAME,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    // One activity is one workspace's whole sweep, so a low number keeps the connection pool sane.
    maxConcurrentActivityTaskExecutions:
      MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
    connection,
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

  // Start the schedule.
  await launchArchiveInactiveAgentsSchedule();

  await worker.run();
}
