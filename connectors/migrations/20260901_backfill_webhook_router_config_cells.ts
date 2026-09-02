import type { Logger } from "@connectors/logger/logger";
import { makeScript } from "scripts/helpers";

makeScript({}, async (_args, logger: Logger) => {
  logger.info(
    "Webhook router cells backfill already applied; this migration is a no-op."
  );
});
