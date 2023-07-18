import { runPostUpsertHooksWorker } from "@app/documents_post_process_hooks/temporal/worker";
import logger from "@app/logger/logger";

runPostUpsertHooksWorker().catch((err) =>
  logger.error({ error: err }, "Error running post upsert hooks worker")
);
