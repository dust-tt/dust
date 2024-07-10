import { setupGlobalErrorHandler } from "@dust-tt/types";

import logger from "@app/logger/logger";
import { runPokeWorker } from "@app/poke/temporal/worker";
import { runPostUpsertHooksWorker } from "@app/temporal/documents_post_process_hooks/worker";
import { runHardDeleteWorker } from "@app/temporal/hard_delete/worker";
import { runLabsWorker } from "@app/temporal/labs/worker";
import { runMentionsCountWorker } from "@app/temporal/mentions_count_queue/worker";
import { runProductionChecksWorker } from "@app/temporal/production_checks/worker";
import { runScrubWorkspaceQueueWorker } from "@app/temporal/scrub_workspace/worker";
import { runUpsertQueueWorker } from "@app/temporal/upsert_queue/worker";
import { runUpdateWorkspaceUsageWorker } from "@app/temporal/usage_queue/worker";

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

runHardDeleteWorker().catch((err) =>
  logger.error({ error: err }, "Error running hard delete worker.")
);

runMentionsCountWorker().catch((err) =>
  logger.error({ error: err }, "Error running mentions count worker.")
);
