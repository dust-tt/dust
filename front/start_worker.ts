import type { Logger, LogLevel } from "@temporalio/common/lib/logger";
import { Runtime } from "@temporalio/worker/lib/runtime";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import logger from "@app/logger/logger";
import type { WorkerName } from "@app/temporal/worker_registry";
import {
  ALL_WORKERS,
  ALL_WORKERS_BUT_RELOCATION,
  workerFunctions,
} from "@app/temporal/worker_registry";
import { setupGlobalErrorHandler } from "@app/types/shared/utils/global_error_handler";

setupGlobalErrorHandler(logger);

const pinoAdapter: Logger = {
  log: (level: LogLevel, msg: string, meta: object) =>
    ({
      TRACE: logger.trace,
      DEBUG: logger.debug,
      INFO: logger.info,
      WARN: logger.warn,
      ERROR: logger.error,
    })[level](meta ?? {}, msg),
  info: (msg: string, meta: object) => logger.info(meta ?? {}, msg),
  warn: (msg: string, meta: object) => logger.warn(meta ?? {}, msg),
  error: (msg: string, meta: object) => logger.error(meta ?? {}, msg),
  debug: (msg: string, meta: object) => logger.debug(meta ?? {}, msg),
  trace: (msg: string, meta: object) => logger.trace(meta ?? {}, msg),
};

// Install once per process — before creating Worker/Client.
Runtime.install({
  logger: pinoAdapter,
  telemetryOptions: {
    metrics: {
      // Datadog Agent OTLP gRPC (4317).
      otel: { url: "grpc://datadog-agent.default.svc.cluster.local:4317" },
    },
  },
});

async function runWorkers(workers: WorkerName[]) {
  for (const worker of workers) {
    workerFunctions[worker]().catch((err) =>
      logger.error({ error: err }, `Error running ${worker} worker.`)
    );
  }
}

yargs(hideBin(process.argv))
  .option("workers", {
    alias: "w",
    type: "array",
    choices: ALL_WORKERS,
    default: ALL_WORKERS_BUT_RELOCATION,
    demandOption: true,
    description: "Choose one or multiple workers to run.",
  })
  .help()
  .alias("help", "h")
  .parseAsync()
  .then(async (args) => runWorkers(args.workers as WorkerName[]))
  .catch((err) => {
    logger.error({ error: err }, "Error running workers");
    process.exit(1);
  });
