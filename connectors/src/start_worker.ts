import type { ConnectorProvider } from "@dust-tt/types";
import { setupGlobalErrorHandler } from "@dust-tt/types";
import { setFlagsFromString } from "v8";
import { runInNewContext } from "vm";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { runConfluenceWorker } from "@connectors/connectors/confluence/temporal/worker";
import { runWebCrawlerWorker } from "@connectors/connectors/webcrawler/temporal/worker";

import { runGithubWorker } from "./connectors/github/temporal/worker";
import { runGoogleWorker } from "./connectors/google_drive/temporal/worker";
import { runIntercomWorker } from "./connectors/intercom/temporal/worker";
import { runNotionWorker } from "./connectors/notion/temporal/worker";
import { runSlackWorker } from "./connectors/slack/temporal/worker";
import { errorFromAny } from "./lib/error";
import logger from "./logger/logger";

setupGlobalErrorHandler(logger);

const workerFunctions: Record<ConnectorProvider, () => Promise<void>> = {
  confluence: runConfluenceWorker,
  github: runGithubWorker,
  google_drive: runGoogleWorker,
  intercom: runIntercomWorker,
  notion: runNotionWorker,
  slack: runSlackWorker,
  webcrawler: runWebCrawlerWorker,
};

const ALL_WORKERS = Object.keys(workerFunctions) as ConnectorProvider[];

function logMemoryUsage(worker: string) {
  setFlagsFromString("--expose_gc");
  const gc = runInNewContext("gc");
  const now = Date.now();

  gc();
  const gcDurationMs = Date.now() - now;
  // now get the current process memory usage
  const mem = process.memoryUsage();
  logger.info(
    {
      rssMb: Math.round(mem.rss / 1024 / 1024),

      host: process.env.HOSTNAME,
      gcDurationMs: gcDurationMs,
      worker: worker,
    },
    "Memory usage"
  );
}

async function runWorkers(workers: ConnectorProvider[]) {
  if (workers.length === 1) {
    const worker = workers[0];
    if (worker) {
      // get a first data point after 1 minute of process warm up.
      setTimeout(() => {
        logMemoryUsage(worker);
      }, 60 * 1000);
      // Get a data point every 30 minutes.
      setInterval(() => {
        logMemoryUsage(worker);
      }, 60 * 30 * 1000);
    }
  }
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
  .then(async (args) => runWorkers(args.workers as ConnectorProvider[]))
  .catch((err) => {
    logger.error(errorFromAny(err), "Error running workers");
    process.exit(1);
  });
