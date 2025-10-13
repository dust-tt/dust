import { WebhookSourceModel } from "@app/lib/models/assistant/triggers/webhook_source";
import { generateSecureSecret } from "@app/lib/resources/string_ids";
import { makeScript } from "@app/scripts/helpers";

// Migration script to set urlSecret for webhook sources that have null urlSecret values.
// This ensures all webhook sources have a valid urlSecret before the field is made non-nullable.

makeScript({}, async ({ execute }, logger) => {
  const webhookSourcesWithNullUrlSecret = await WebhookSourceModel.findAll({
    // @ts-expect-error migration : set urlSecret not null
    where: {
      urlSecret: null,
    },
  });

  logger.info(
    { count: webhookSourcesWithNullUrlSecret.length },
    "Found webhook sources with null urlSecret"
  );

  if (webhookSourcesWithNullUrlSecret.length === 0) {
    logger.info("No webhook sources with null urlSecret found");
    return;
  }

  for (const webhookSource of webhookSourcesWithNullUrlSecret) {
    logger.info(
      {
        webhookSourceId: webhookSource.id,
        name: webhookSource.name,
        workspaceId: webhookSource.workspaceId,
      },
      "Processing webhook source"
    );

    if (execute) {
      const newUrlSecret = generateSecureSecret(64);

      await webhookSource.update({
        urlSecret: newUrlSecret,
      });

      logger.info(
        {
          webhookSourceId: webhookSource.id,
          name: webhookSource.name,
        },
        "Updated webhook source with new urlSecret"
      );
    }
  }

  logger.info(
    {
      count: webhookSourcesWithNullUrlSecret.length,
      executed: execute,
    },
    "Backfill completed"
  );
});
