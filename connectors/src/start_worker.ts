import type { ConnectorProvider } from "@dust-tt/client";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { runBigQueryWorker } from "@connectors/connectors/bigquery/temporal/worker";
import { runConfluenceWorker } from "@connectors/connectors/confluence/temporal/worker";
import { runGongWorker } from "@connectors/connectors/gong/temporal/worker";
import { runMicrosoftWorker } from "@connectors/connectors/microsoft/temporal/worker";
import { runSalesforceWorker } from "@connectors/connectors/salesforce/temporal/worker";
import { runSnowflakeWorker } from "@connectors/connectors/snowflake/temporal/worker";
import { runWebCrawlerWorker } from "@connectors/connectors/webcrawler/temporal/worker";
import { setupGlobalErrorHandler } from "@connectors/types";

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
