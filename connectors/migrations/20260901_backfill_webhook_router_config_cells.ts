import { WebhookRouterConfigService } from "@connectors/lib/webhook_router_config";
import type { Logger } from "@connectors/logger/logger";
import { makeScript } from "scripts/helpers";

makeScript({}, async ({ execute }, logger: Logger) => {
  const service = new WebhookRouterConfigService();
  const { entriesUpdated } = await service.backfillMissingCells(execute);

  if (entriesUpdated === 0) {
    logger.info("No webhook router entries need cells backfill.");
    return;
  }

  if (execute) {
    logger.info(
      { entriesUpdated },
      "Backfilled cells from regions in webhook router config."
    );
  } else {
    logger.info(
      { entriesUpdated },
      "[DRY RUN] Would backfill cells from regions in webhook router config."
    );
  }
});
