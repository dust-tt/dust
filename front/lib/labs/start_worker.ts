import { setupGlobalErrorHandler } from "@dust-tt/types";

import { runLabsWorker } from "@app/lib/labs/temporal/worker";
import logger from "@app/logger/logger";

setupGlobalErrorHandler(logger);

runLabsWorker().catch((err) =>
  logger.error({ error: err }, "Error running retrieve new transcripts worker")
);
