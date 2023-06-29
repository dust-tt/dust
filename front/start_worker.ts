import logger from "@app/logger/logger";
import { runPostUpsertHooksWorker } from "@app/post_upsert_hooks/temporal/worker";

runPostUpsertHooksWorker().catch((err) =>
  logger.error({ error: err }, "Error running post upsert hooks worker")
);
