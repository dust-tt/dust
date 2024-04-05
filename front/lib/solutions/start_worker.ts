import { setupGlobalErrorHandler } from "@dust-tt/types";

import { runSolutionsTranscriptsWorker } from "@app/lib/solutions/transcripts/temporal/worker";
import logger from "@app/logger/logger";

setupGlobalErrorHandler(logger);

runSolutionsTranscriptsWorker().catch((err) =>
  logger.error({ error: err }, "Error running retrieve new transcripts worker")
);
