import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";
import type { Context } from "@temporalio/activity";
import {
  makeWorkflowExporter,
  OpenTelemetryActivityInboundInterceptor,
  OpenTelemetryActivityOutboundInterceptor,
} from "@temporalio/interceptors-opentelemetry/lib/worker";
import { Worker } from "@temporalio/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

import {
  initializeOpenTelemetryInstrumentation,
  resource,
} from "@app/lib/api/instrumentation/init";
import { getTemporalAgentWorkerConnection } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { launchAgentMessageAnalyticsActivity } from "@app/temporal/agent_loop/activities/analytics";
import {
  finalizeCancellationActivity,
  notifyWorkflowError,
} from "@app/temporal/agent_loop/activities/common";
import { ensureConversationTitleActivity } from "@app/temporal/agent_loop/activities/ensure_conversation_title";
import {
  finalizeAgentLoopActivity,
  finalizeCancelledAgentLoopActivity,
  finalizeErroredAgentLoopActivity,
} from "@app/temporal/agent_loop/activities/finalize";
import {
  logAgentLoopPhaseCompletionActivity,
  logAgentLoopPhaseStartActivity,
  logAgentLoopStepCompletionActivity,
} from "@app/temporal/agent_loop/activities/instrumentation";
import { handleMentionsActivity } from "@app/temporal/agent_loop/activities/mentions";
import { conversationUnreadNotificationActivity } from "@app/temporal/agent_loop/activities/notification";
import { publishDeferredEventsActivity } from "@app/temporal/agent_loop/activities/publish_deferred_events";
import { runModelAndCreateActionsActivity } from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";
import { trackProgrammaticUsageActivity } from "@app/temporal/agent_loop/activities/usage_tracking";
import { QUEUE_NAME } from "@app/temporal/agent_loop/config";
import { getWorkflowConfig } from "@app/temporal/bundle_helper";
import { isDevelopment, removeNulls } from "@app/types";

// We need to give the worker some time to finish the current activity before shutting down.
const SHUTDOWN_GRACE_TIME = "2 minutes";

export async function runAgentLoopWorker() {
  const { connection, namespace } = await getTemporalAgentWorkerConnection();

  // Initialize LLMs instrumentation for the worker.
  initializeOpenTelemetryInstrumentation({ serviceName: "dust-agent-loop" });

  const spanExporter = new InMemorySpanExporter();

  const worker = await Worker.create({
    ...getWorkflowConfig({
      workerName: "agent_loop",
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities: {
      conversationUnreadNotificationActivity,
      ensureConversationTitleActivity,
      finalizeAgentLoopActivity,
      finalizeCancelledAgentLoopActivity,
      finalizeErroredAgentLoopActivity,
      finalizeCancellationActivity,
      handleMentionsActivity,
      launchAgentMessageAnalyticsActivity,
      logAgentLoopPhaseCompletionActivity,
      logAgentLoopPhaseStartActivity,
      logAgentLoopStepCompletionActivity,
      notifyWorkflowError,
      publishDeferredEventsActivity,
      runModelAndCreateActionsActivity,
      runToolActivity,
      trackProgrammaticUsageActivity,
    },
    taskQueue: QUEUE_NAME,
    connection,
    namespace,
    shutdownGraceTime: SHUTDOWN_GRACE_TIME,
    // This also bounds the time until an activity may receive a cancellation signal.
    // See https://docs.temporal.io/encyclopedia/detecting-activity-failures#throttling
    maxHeartbeatThrottleInterval: "20 seconds",
    interceptors: {
      workflowModules: removeNulls([
        isDevelopment() ? require.resolve("./workflows") : null,
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
    bundlerOptions: {
      // Update the webpack config to use aliases from our tsconfig.json. This let us import code
      // in the workflows and activities files using the @app/ prefix. We also need to ignore some
      // modules that are not available in Temporal environment.
      webpackConfigHook: (config) => {
        const plugins = config.resolve?.plugins ?? [];

        config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
        return config;
      },
      ignoreModules: ["child_process", "crypto", "stream"],
    },
  });

  // TODO(2025-11-12 INSTRUMENTATION): Drain Langfuse data before shutdown.
  process.on("SIGTERM", () => worker.shutdown());

  try {
    await worker.run(); // this resolves after shutdown completes
  } catch (error) {
    logger.error({ error }, "Agent loop worker error");
  } finally {
    await connection.close();
    process.exit(0);
  }
}
