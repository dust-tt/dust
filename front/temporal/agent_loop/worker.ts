import {
  initializeOpenTelemetryInstrumentation,
  resource,
} from "@app/lib/api/instrumentation/init";
import { NoopSpanExporter } from "@app/lib/api/instrumentation/noop_span_exporter";
import { markShuttingDownWithDelayedAbort } from "@app/lib/shutdown_signal";
import { getTemporalAgentWorkerConnection } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import {
  compactionActivity,
  compactionCleanupActivity,
} from "@app/temporal/agent_loop/activities/compaction";
import {
  checkCreditsActivity,
  checkWorkflowAlertThresholdActivity,
} from "@app/temporal/agent_loop/activities/credit_check";
import { ensureConversationTitleActivity } from "@app/temporal/agent_loop/activities/ensure_conversation_title";
import {
  finalizeCancelledAgentLoopActivity,
  finalizeCreditStoppedAgentLoopActivity,
  finalizeErroredAgentLoopActivity,
  finalizeGracefullyStoppedAgentLoopActivity,
  finalizeInterruptedAgentLoopActivity,
  finalizeSuccessfulAgentLoopActivity,
} from "@app/temporal/agent_loop/activities/finalize";
import { finalizeErroredSandboxChildToolActivity } from "@app/temporal/agent_loop/activities/finalize_sandbox_child_tool";
import { publishDeferredEventsActivity } from "@app/temporal/agent_loop/activities/publish_deferred_events";
import { runModelAndCreateActionsActivity } from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";
import {
  BATCH_QUEUE_NAME,
  INTERACTIVE_QUEUE_NAME,
  PROGRAMMATIC_QUEUE_NAME,
  SCHEDULES_QUEUE_NAME,
} from "@app/temporal/agent_loop/config";
import { instrumentationSinks } from "@app/temporal/agent_loop/sinks";
import {
  createTemporalWorker,
  getWorkflowConfig,
} from "@app/temporal/bundle_helper";
import type { WorkerName } from "@app/temporal/worker_registry";
import { isDevelopment } from "@app/types/shared/env";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { Context } from "@temporalio/activity";
import {
  makeWorkflowExporter,
  OpenTelemetryActivityInboundInterceptor,
  OpenTelemetryActivityOutboundInterceptor,
} from "@temporalio/interceptors-opentelemetry/lib/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

// Must match front-agent-loop-worker's terminationGracePeriodSeconds.
const SHUTDOWN_GRACE_TIME_MS = 120 * 1_000;
const SHUTDOWN_ABORT_BUFFER_MS = 10 * 1_000;
const SHUTDOWN_TOOL_ABORT_DELAY_MS =
  SHUTDOWN_GRACE_TIME_MS - SHUTDOWN_ABORT_BUFFER_MS;

const MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS = 40;

export async function runAgentLoopBatchWorker() {
  return runAgentLoopWorkerForQueue({
    workerName: "agent_loop_batch",
    taskQueue: BATCH_QUEUE_NAME,
  });
}

export async function runAgentLoopInteractiveWorker() {
  return runAgentLoopWorkerForQueue({
    workerName: "agent_loop_interactive",
    taskQueue: INTERACTIVE_QUEUE_NAME,
  });
}

export async function runAgentLoopProgrammaticWorker() {
  return runAgentLoopWorkerForQueue({
    workerName: "agent_loop_programmatic",
    taskQueue: PROGRAMMATIC_QUEUE_NAME,
  });
}

export async function runAgentLoopSchedulesWorker() {
  return runAgentLoopWorkerForQueue({
    workerName: "agent_loop_schedules",
    taskQueue: SCHEDULES_QUEUE_NAME,
  });
}

async function runAgentLoopWorkerForQueue({
  workerName,
  taskQueue,
}: {
  workerName: WorkerName;
  taskQueue: string;
}) {
  const { connection, namespace } = await getTemporalAgentWorkerConnection();

  // Initialize LLMs instrumentation for the worker.
  initializeOpenTelemetryInstrumentation({ serviceName: "dust-agent-loop" });

  const spanExporter = new NoopSpanExporter();

  const worker = await createTemporalWorker({
    ...getWorkflowConfig({
      workerName,
      getWorkflowsPath: () => require.resolve("./workflows"),
    }),
    activities: {
      compactionActivity,
      compactionCleanupActivity,
      ensureConversationTitleActivity,
      finalizeSuccessfulAgentLoopActivity,
      finalizeGracefullyStoppedAgentLoopActivity,
      finalizeCreditStoppedAgentLoopActivity,
      finalizeCancelledAgentLoopActivity,
      finalizeInterruptedAgentLoopActivity,
      finalizeErroredAgentLoopActivity,
      finalizeErroredSandboxChildToolActivity,
      checkCreditsActivity,
      checkWorkflowAlertThresholdActivity,
      publishDeferredEventsActivity,
      runModelAndCreateActionsActivity,
      runToolActivity,
    },
    taskQueue,
    connection,
    namespace,
    shutdownGraceTime: SHUTDOWN_GRACE_TIME_MS,
    // This also bounds the time until an activity may receive a cancellation signal.
    // See https://docs.temporal.io/encyclopedia/detecting-activity-failures#throttling
    maxHeartbeatThrottleInterval: "20 seconds",
    maxConcurrentActivityTaskExecutions:
      MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
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
      ...instrumentationSinks,
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
  process.on("SIGTERM", () => {
    markShuttingDownWithDelayedAbort(SHUTDOWN_TOOL_ABORT_DELAY_MS);
    void worker.shutdown();
  });

  try {
    await worker.run(); // this resolves after shutdown completes
  } catch (error) {
    logger.error(
      { err: normalizeError(error), taskQueue },
      "Agent loop worker error"
    );
  } finally {
    await connection.close();
    process.exit(0);
  }
}
