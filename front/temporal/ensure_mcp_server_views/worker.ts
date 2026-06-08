import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/ensure_mcp_server_views/activities";
import { launchEnsureMCPServerViewsSchedule } from "@app/temporal/ensure_mcp_server_views/client";
import { QUEUE_NAME } from "@app/temporal/ensure_mcp_server_views/config";
import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";

export async function runEnsureMCPServerViewsWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();
  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "ensure_mcp_server_views",
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
        (ctx: Context) => {
          return {
            inbound: new ActivityInboundLogInterceptor(ctx, logger),
          };
        },
      ],
    },
  });

  await launchEnsureMCPServerViewsSchedule();

  await worker.run();
}
