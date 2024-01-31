import { setupGlobalErrorHandler } from "@dust-tt/types";

import { runPostUpsertHooksWorker } from "@app/documents_post_process_hooks/temporal/worker";
import logger from "@app/logger/logger";
import { runPokeWorker } from "@app/poke/temporal/worker";
import { runProductionChecksWorker } from "@app/production_checks/temporal/worker";

setupGlobalErrorHandler(logger);

runPostUpsertHooksWorker().catch((err) =>
  logger.error({ error: err }, "Error running post upsert hooks worker")
);
runPokeWorker().catch((err) =>
  logger.error({ error: err }, "Error running poke worker")
);

runProductionChecksWorker().catch((err) =>
  logger.error({ error: err }, "Error running production checks worker")
);
