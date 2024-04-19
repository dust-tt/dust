import { setupGlobalErrorHandler } from "@dust-tt/types";

import { runPostUpsertHooksWorker } from "@app/documents_post_process_hooks/temporal/worker";
import logger from "@app/logger/logger";
import { runPokeWorker } from "@app/poke/temporal/worker";
import { runProductionChecksWorker } from "@app/production_checks/temporal/worker";
import { runScrubWorkspaceQueueWorker } from "@app/scrub_workspace/temporal/worker";
import { runLabsWorker } from "@app/temporal/labs/worker";
import { runUpdateWorkspaceUsageWorker } from "@app/temporal/usage_queue/worker";
import { runUpsertQueueWorker } from "@app/upsert_queue/temporal/worker";

setupGlobalErrorHandler(logger);

runPostUpsertHooksWorker().catch((err) =>
  logger.error({ error: err }, "Error running post upsert hooks worker.")
);
runPokeWorker().catch((err) =>
  logger.error({ error: err }, "Error running poke worker.")
);

runProductionChecksWorker().catch((err) =>
  logger.error({ error: err }, "Error running production checks worker.")
);

runUpsertQueueWorker().catch((err) =>
  logger.error({ error: err }, "Error running upsert queue worker.")
);

runUpdateWorkspaceUsageWorker().catch((err) =>
  logger.error({ error: err }, "Error running usage queue worker.")
);

runScrubWorkspaceQueueWorker().catch((err) =>
  logger.error({ error: err }, "Error running scrub workspace queue worker.")
);

runLabsWorker().catch((err) =>
  logger.error({ error: err }, "Error running labs worker.")
);
