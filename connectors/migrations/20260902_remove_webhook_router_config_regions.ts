import { WebhookRouterConfigService } from "@connectors/lib/webhook_router_config";
import type { Logger } from "@connectors/logger/logger";
import { makeScript } from "scripts/helpers";

makeScript({}, async ({ execute }, logger: Logger) => {
  const service = new WebhookRouterConfigService();
  const { entriesUpdated } = await service.removeRegions(execute);

  if (entriesUpdated === 0) {
    logger.info("No webhook router entries have a regions field to remove.");
    return;
  }

  if (execute) {
    logger.info(
      { entriesUpdated },
      "Removed regions from webhook router config entries."
    );
  } else {
    logger.info(
      { entriesUpdated },
      "[DRY RUN] Would remove regions from webhook router config entries."
    );
  }
});
