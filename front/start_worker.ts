import { setupGlobalErrorHandler } from "@dust-tt/types";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import logger from "@app/logger/logger";
import { runPokeWorker } from "@app/poke/temporal/worker";
import { runPostUpsertHooksWorker } from "@app/temporal/documents_post_process_hooks/worker";
import { runHardDeleteWorker } from "@app/temporal/hard_delete/worker";
import { runLabsWorker } from "@app/temporal/labs/worker";
import { runMentionsCountWorker } from "@app/temporal/mentions_count_queue/worker";
import { runProductionChecksWorker } from "@app/temporal/production_checks/worker";
import { runScrubWorkspaceQueueWorker } from "@app/temporal/scrub_workspace/worker";
import { runUpsertQueueWorker } from "@app/temporal/upsert_queue/worker";
import { runUpsertTableQueueWorker } from "@app/temporal/upsert_tables/worker";
import { runUpdateWorkspaceUsageWorker } from "@app/temporal/usage_queue/worker";

setupGlobalErrorHandler(logger);

type WorkerName =
  | "hard_delete"
  | "labs"
  | "mentions_count"
  | "poke"
  | "post_upsert_hooks"
  | "production_checks"
  | "scrub_workspace_queue"
  | "update_workspace_usage"
  | "upsert_queue"
  | "upsert_table_queue";

const workerFunctions: Record<WorkerName, () => Promise<void>> = {
  hard_delete: runHardDeleteWorker,
  labs: runLabsWorker,
  mentions_count: runMentionsCountWorker,
  poke: runPokeWorker,
  post_upsert_hooks: runPostUpsertHooksWorker,
  production_checks: runProductionChecksWorker,
  scrub_workspace_queue: runScrubWorkspaceQueueWorker,
  update_workspace_usage: runUpdateWorkspaceUsageWorker,
  upsert_queue: runUpsertQueueWorker,
  upsert_table_queue: runUpsertTableQueueWorker,
};
const ALL_WORKERS = Object.keys(workerFunctions);

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
    default: ALL_WORKERS,
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
