import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import logger from "@app/logger/logger";
import { runPokeWorker } from "@app/poke/temporal/worker";
import { runAgentLoopWorker } from "@app/temporal/agent_loop/worker";
import { runDataRetentionWorker } from "@app/temporal/data_retention/worker";
import { runHardDeleteWorker } from "@app/temporal/hard_delete/worker";
import { runLabsConnectionsWorker } from "@app/temporal/labs/connections/worker";
import { runLabsTranscriptsWorker } from "@app/temporal/labs/transcripts/worker";
import { runMentionsCountWorker } from "@app/temporal/mentions_count_queue/worker";
import { runPermissionsWorker } from "@app/temporal/permissions_queue/worker";
import { runProductionChecksWorker } from "@app/temporal/production_checks/worker";
import { runRelocationWorker } from "@app/temporal/relocation/worker";
import { runRemoteToolsSyncWorker } from "@app/temporal/remote_tools/worker";
import { runScrubWorkspaceQueueWorker } from "@app/temporal/scrub_workspace/worker";
import {
  runTrackerNotificationWorker,
  runTrackerWorker,
} from "@app/temporal/tracker/worker";
import { runUpsertQueueWorker } from "@app/temporal/upsert_queue/worker";
import { runUpsertTableQueueWorker } from "@app/temporal/upsert_tables/worker";
import { runUpdateWorkspaceUsageWorker } from "@app/temporal/usage_queue/worker";
import { runWorkOSEventsWorker } from "@app/temporal/workos_events_queue/worker";
import { setupGlobalErrorHandler } from "@app/types/shared/utils/global_error_handler";

setupGlobalErrorHandler(logger);

type WorkerName =
  | "agent_loop"
  | "data_retention"
  | "document_tracker"
  | "hard_delete"
  | "labs_connections"
  | "labs"
  | "mentions_count"
  | "permissions_queue"
  | "poke"
  | "production_checks"
  | "relocation"
  | "remote_tools_sync"
  | "scrub_workspace_queue"
  | "tracker_notification"
  | "update_workspace_usage"
  | "upsert_queue"
  | "upsert_table_queue"
  | "workos_events_queue";

const workerFunctions: Record<WorkerName, () => Promise<void>> = {
  agent_loop: runAgentLoopWorker,
  data_retention: runDataRetentionWorker,
  document_tracker: runTrackerWorker,
  hard_delete: runHardDeleteWorker,
  labs_connections: runLabsConnectionsWorker,
  labs: runLabsTranscriptsWorker,
  mentions_count: runMentionsCountWorker,
  permissions_queue: runPermissionsWorker,
  poke: runPokeWorker,
  production_checks: runProductionChecksWorker,
  relocation: runRelocationWorker,
  remote_tools_sync: runRemoteToolsSyncWorker,
  scrub_workspace_queue: runScrubWorkspaceQueueWorker,
  tracker_notification: runTrackerNotificationWorker,
  update_workspace_usage: runUpdateWorkspaceUsageWorker,
  upsert_queue: runUpsertQueueWorker,
  upsert_table_queue: runUpsertTableQueueWorker,
  workos_events_queue: runWorkOSEventsWorker,
};

const ALL_WORKERS = Object.keys(workerFunctions);
const ALL_WORKERS_BUT_RELOCATION = Object.keys(workerFunctions).filter(
  (k) => k !== "relocation"
);

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
