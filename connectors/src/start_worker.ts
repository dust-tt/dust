import type { ConnectorProvider } from "@dust-tt/types";
import { setupGlobalErrorHandler } from "@dust-tt/types";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { runConfluenceWorker } from "@connectors/connectors/confluence/temporal/worker";
import { runMicrosoftWorker } from "@connectors/connectors/microsoft/temporal/worker";
import { runSnowflakeWorker } from "@connectors/connectors/snowflake/temporal/worker";
import { runWebCrawlerWorker } from "@connectors/connectors/webcrawler/temporal/worker";

import { runGithubWorker } from "./connectors/github/temporal/worker";
import { runGoogleWorkers } from "./connectors/google_drive/temporal/worker";
import { runIntercomWorker } from "./connectors/intercom/temporal/worker";
import {
  runNotionGarbageCollectWorker,
  runNotionWorker,
} from "./connectors/notion/temporal/worker";
import { runSlackWorker } from "./connectors/slack/temporal/worker";
import { errorFromAny } from "./lib/error";
import logger from "./logger/logger";

setupGlobalErrorHandler(logger);

type WorkerType = ConnectorProvider | "notion_garbage_collector";

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
};

const ALL_WORKERS = Object.keys(workerFunctions) as WorkerType[];

async function runWorkers(workers: WorkerType[]) {
  for (const worker of workers) {
    workerFunctions[worker]().catch((err) =>
      logger.error(errorFromAny(err), `Error running ${worker} worker.`)
    );
  }
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
