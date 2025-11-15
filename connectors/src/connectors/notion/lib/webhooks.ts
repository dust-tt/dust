import { sendDeletionCrawlSignal } from "@connectors/connectors/notion/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import mainLogger from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";

const logger = mainLogger.child({ provider: "notion" });

export type NotionWebhookEvent = {
  type: "database.deleted" | "page.deleted";
  entity_id: string;
};

export async function processNotionWebhookEvent({
  connectorId,
  event,
}: {
  connectorId: ModelId;
  event: NotionWebhookEvent;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const loggerArgs = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId,
    provider: "notion",
    dataSourceId: dataSourceConfig.dataSourceId,
  };

  logger.info(
    {
      ...loggerArgs,
      eventType: event.type,
      entityId: event.entity_id,
    },
    "Processing Notion webhook event"
  );
  statsDClient.increment("notion.webhook_events", 1, [`type:${event.type}`]);

  // Handle deletion/archive events by triggering deletion crawl
  if (event.type === "page.deleted") {
    logger.info(
      {
        ...loggerArgs,
        eventType: event.type,
        entityId: event.entity_id,
      },
      "Page deleted/archived, triggering deletion crawl"
    );
    const result = await sendDeletionCrawlSignal(
      connectorId,
      event.entity_id,
      "page"
    );
    if (result.isErr()) {
      logger.error(
        {
          ...loggerArgs,
          eventType: event.type,
          entityId: event.entity_id,
          error: result.error,
        },
        "Failed to send deletion crawl signal for page"
      );
      throw result.error;
    }
  } else if (event.type === "database.deleted") {
    logger.info(
      {
        ...loggerArgs,
        eventType: event.type,
        entityId: event.entity_id,
      },
      "Database deleted/archived, triggering deletion crawl"
    );
    const result = await sendDeletionCrawlSignal(
      connectorId,
      event.entity_id,
      "database"
    );
    if (result.isErr()) {
      logger.error(
        {
          ...loggerArgs,
          eventType: event.type,
          entityId: event.entity_id,
          error: result.error,
        },
        "Failed to send deletion crawl signal for database"
      );
      throw result.error;
    }
  }
}
