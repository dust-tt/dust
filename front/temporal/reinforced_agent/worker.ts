import {
  initializeOpenTelemetryInstrumentation,
  resource,
} from "@app/lib/api/instrumentation/init";
import {
  getTemporalWorkerConnection,
  TEMPORAL_MAXED_CACHED_WORKFLOWS,
} from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import * as activities from "@app/temporal/reinforced_agent/activities";
import { NoopSpanExporter } from "@app/lib/api/instrumentation/noop_span_exporter";
import { isDevelopment } from "@app/types/shared/env";
import { removeNulls } from "@app/types/shared/utils/general";
import type { Context } from "@temporalio/activity";
import {
  makeWorkflowExporter,
  OpenTelemetryActivityInboundInterceptor,
  OpenTelemetryActivityOutboundInterceptor,
} from "@temporalio/interceptors-opentelemetry/lib/worker";
import { Worker } from "@temporalio/worker";

import { QUEUE_NAME } from "./config";

export async function runReinforcedAgentWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();

  initializeOpenTelemetryInstrumentation({
    serviceName: "dust-reinforced-agent",
  });

  const spanExporter = new NoopSpanExporter();

  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "reinforced_agent",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities,
    taskQueue: QUEUE_NAME,
    maxCachedWorkflows: TEMPORAL_MAXED_CACHED_WORKFLOWS,
    maxConcurrentActivityTaskExecutions: 8,
    connection,
    namespace,
    interceptors: {
      workflowModules: removeNulls([
        !isDevelopment() || process.env.USE_TEMPORAL_BUNDLES === "true"
          ? null
          : require.resolve("./workflows"),
      ]),
      activity: [
        (ctx: Context) => {
          return {
            inbound: new ActivityInboundLogInterceptor(ctx, logger),
          };
        },
        (ctx) => ({
          inbound: new OpenTelemetryActivityInboundInterceptor(ctx),
          outbound: new OpenTelemetryActivityOutboundInterceptor(ctx),
        }),
      ],
    },
    sinks: {
      // @ts-expect-error InMemorySpanExporter type mismatch.
      exporter: makeWorkflowExporter(spanExporter, resource),
    },
  });

  await worker.run();
}
