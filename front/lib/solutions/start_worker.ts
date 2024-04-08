import { setupGlobalErrorHandler } from "@dust-tt/types";

import { runSolutionsWorker } from "@app/lib/solutions/transcripts/temporal/worker";
import logger from "@app/logger/logger";

setupGlobalErrorHandler(logger);

runSolutionsWorker().catch((err) =>
  logger.error({ error: err }, "Error running retrieve new transcripts worker")
);
