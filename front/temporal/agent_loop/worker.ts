import type { Context } from "@temporalio/activity";
import { Worker } from "@temporalio/worker";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

import { getTemporalWorkerConnection } from "@app/lib/temporal";
import { ActivityInboundLogInterceptor } from "@app/lib/temporal_monitoring";
import logger from "@app/logger/logger";
import { ensureConversationTitleActivity } from "@app/temporal/agent_loop/activities/ensure_conversation_title";
import { runModelActivity } from "@app/temporal/agent_loop/activities/run_model";
import { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";
import { QUEUE_NAME } from "@app/temporal/agent_loop/config";

// We need to give the worker some time to finish the current activity before shutting down.
const SHUTDOWN_GRACE_TIME = "2 minutes";

export async function runAgentLoopWorker() {
  const { connection, namespace } = await getTemporalWorkerConnection();

  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows"),
    activities: {
      runModelActivity,
      runToolActivity,
      ensureConversationTitleActivity,
    },
    taskQueue: QUEUE_NAME,
    connection,
    namespace,
    shutdownGraceTime: SHUTDOWN_GRACE_TIME,
    interceptors: {
      activityInbound: [
        (ctx: Context) => {
          return new ActivityInboundLogInterceptor(ctx, logger);
        },
      ],
    },
    bundlerOptions: {
      // Update the webpack config to use aliases from our tsconfig.json. This let us import code
      // in the workflows and activities files using the @app/ prefix. We also need to ignore some
      // modules that are not available in Temporal environment.
      webpackConfigHook: (config) => {
        const plugins = config.resolve?.plugins ?? [];
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
        return config;
      },
      ignoreModules: ["child_process", "crypto", "stream"],
    },
  });

  await worker.run();
}
