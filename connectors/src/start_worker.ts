import type { WorkerName } from "@connectors/temporal/worker_registry";
import {
  ALL_WORKERS,
  workerFunctions,
} from "@connectors/temporal/worker_registry";
import { isDevelopment, setupGlobalErrorHandler } from "@connectors/types";
import { closeRedisClients } from "@connectors/types/shared/redis_client";
import type { Logger, LogLevel } from "@temporalio/common/lib/logger";
import { Runtime } from "@temporalio/worker/lib/runtime";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { errorFromAny } from "./lib/error";
import logger from "./logger/logger";

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

// Install once per process — before creating Worker/Client
Runtime.install({
  logger: pinoAdapter,
});

async function runWorkers(workers: WorkerName[]) {
  // Start all workers in parallel
  try {
    const promises = workers.map((worker) =>
      Promise.resolve()
        .then(() => workerFunctions[worker]())
        .catch((err) => {
          logger.error(errorFromAny(err), `Error running ${worker} worker.`);
        })
    );

    // Wait for all workers to complete
    await Promise.all(promises);
  } catch (e) {
    logger.error(errorFromAny(e), "Unexpected error during worker startup.");
  }

  // Shutdown Temporal native runtime *once*
  // Fix the issue of connectors hanging after receiving SIGINT in dev
  // We don't have this issue with front workers, and deserve an investigation (no appetite for now)
  if (isDevelopment()) {
    await Runtime.instance().shutdown();
  }

  // Shutdown potential Redis clients.
  await closeRedisClients();
}

yargs(hideBin(process.argv))
  .option("workers", {
    alias: "w",
    type: "array",
    choices: ALL_WORKERS,
    default: ALL_WORKERS,
    demandOption: true,
    description: "Choose one or multiple workers to run.",
  })
  .help()
  .alias("help", "h")
  .parseAsync()
  .then(async (args) => runWorkers(args.workers as WorkerName[]))
  .catch((err) => {
    logger.error(errorFromAny(err), "Error running workers");
    process.exit(1);
  });
