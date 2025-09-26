import type { ConnectorProvider } from "@dust-tt/client";
import type { Logger, LogLevel } from "@temporalio/common/lib/logger";
import { Runtime } from "@temporalio/worker/lib/runtime";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { runBigQueryWorker } from "@connectors/connectors/bigquery/temporal/worker";
import { runConfluenceWorker } from "@connectors/connectors/confluence/temporal/worker";
import { runGongWorker } from "@connectors/connectors/gong/temporal/worker";
import { runMicrosoftWorker } from "@connectors/connectors/microsoft/temporal/worker";
import { runSalesforceWorker } from "@connectors/connectors/salesforce/temporal/worker";
import { runSnowflakeWorker } from "@connectors/connectors/snowflake/temporal/worker";
import { runWebCrawlerWorker } from "@connectors/connectors/webcrawler/temporal/worker";
import { isDevelopment, setupGlobalErrorHandler } from "@connectors/types";
import { closeRedisClient } from "@connectors/types/shared/redis";

import { runGithubWorker } from "./connectors/github/temporal/worker";
import { runGoogleWorkers } from "./connectors/google_drive/temporal/worker";
import { runIntercomWorker } from "./connectors/intercom/temporal/worker";
import {
  runNotionGarbageCollectWorker,
  runNotionWorker,
} from "./connectors/notion/temporal/worker";
import { runSlackWorker } from "./connectors/slack/temporal/worker";
import { runZendeskWorkers } from "./connectors/zendesk/temporal/worker";
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

type WorkerType =
  | Exclude<ConnectorProvider, "slack_bot">
  | "notion_garbage_collector";

const workerFunctions: Record<WorkerType, () => Promise<void>> = {
  confluence: runConfluenceWorker,
  github: runGithubWorker,
  google_drive: runGoogleWorkers,
  intercom: runIntercomWorker,
  microsoft: runMicrosoftWorker,
  notion: runNotionWorker,
  notion_garbage_collector: runNotionGarbageCollectWorker,
  slack: runSlackWorker,
  webcrawler: runWebCrawlerWorker,
  snowflake: runSnowflakeWorker,
  zendesk: runZendeskWorkers,
  bigquery: runBigQueryWorker,
  salesforce: runSalesforceWorker,
  gong: runGongWorker,
};

const ALL_WORKERS = Object.keys(workerFunctions) as WorkerType[];

async function runWorkers(workers: WorkerType[]) {
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

  // Shutdown potential Redis client
  await closeRedisClient();
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
  .then(async (args) => runWorkers(args.workers as WorkerType[]))
  .catch((err) => {
    logger.error(errorFromAny(err), "Error running workers");
    process.exit(1);
  });
