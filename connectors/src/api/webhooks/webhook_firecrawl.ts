import { assertNever } from "@dust-tt/client";
import type { Request, Response } from "express";

import {
  launchFirecrawlCrawlCompletedWorkflow,
  launchFirecrawlCrawlFailedWorkflow,
  launchFirecrawlCrawlPageWorkflow,
  launchFirecrawlCrawlStartedWorkflow,
} from "@connectors/connectors/webcrawler/temporal/client";
import mainLogger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

const logger = mainLogger.child({
  provider: "webcrawler",
  service: "firecrawl",
  msgPrefix: "[Firecrawl] ",
});

type FirecrawlWebhookResBody = WithConnectorsAPIErrorReponse<null>;

const _webhookFirecrawlAPIHandler = async (
  req: Request<
    Record<string, string>,
    FirecrawlWebhookResBody,
    {
      success: boolean;
      type: "crawl.started" | "crawl.page" | "crawl.completed" | "crawl.failed";
      id: string;
      data: Array<{
        markdown: string;
        metadata: {
          title: string;
          description: string;
          sourceURL: string;
          statusCode: number;
          scrapeId: string;
          [key: string]: unknown;
        };
      }>;
      metadata: {
        connectorId: number;
      };
      error: string | null;
    }
  >,
  res: Response<FirecrawlWebhookResBody>
) => {
  const { success, type, id, data, metadata, error } = req.body;

  logger.info("Received webhook", {
    success,
    type,
    id,
    metadata,
    error,
  });

  if (!metadata.connectorId) {
    logger.error("Missing connectorId in metadata");
    // We ignore the webhook.
    return res.status(200);
  }

  const connector = await ConnectorResource.fetchById(metadata.connectorId);
  if (!connector) {
    logger.error({ connectorId: metadata.connectorId }, "Connector not found");
    // We ignore the webhook.
    return res.status(200);
  }

  switch (type) {
    case "crawl.started": {
      logger.info(
        {
          id,
          metadata,
          connectorId: connector.id,
        },
        "Crawl started"
      );
      const launchRes = await launchFirecrawlCrawlStartedWorkflow(
        connector.id,
        id
      );
      if (!launchRes.isOk()) {
        logger.error(
          { id, metadata, error: launchRes.error },
          "Failed to launch crawl started workflow"
        );
        return res.status(500).json({
          error: {
            type: "internal_server_error",
            message: "Failed to launch crawl started workflow",
          },
        });
      }
      break;
    }
    case "crawl.page": {
      if (data && data.length > 0) {
        for (const page of data) {
          logger.info(
            {
              id,
              scrapeId: page.metadata.scrapeId,
              connectorId: connector.id,
            },
            "[Firecrawl] Page crawled"
          );
          if (!page.metadata.scrapeId) {
            logger.error(
              {
                id,
                connectorId: connector.id,
              },
              "[Firecrawl] Page crawled with no scrapeId"
            );
            // Interrupt and refuse the webhook.
            return res.status(400).json({
              error: {
                type: "invalid_request_error",
                message: "Page metadata missing scrapeId",
              },
            });
          }

          const launchRes = await launchFirecrawlCrawlPageWorkflow(
            connector.id,
            id,
            page.metadata.scrapeId
          );

          if (!launchRes.isOk()) {
            logger.error(
              {
                id,
                connectorId: connector.id,
                scrapeId: page.metadata.scrapeId,
                error: launchRes.error,
              },
              "Failed to launch crawl page workflow"
            );
            return res.status(500).json({
              error: {
                type: "internal_server_error",
                message: "Failed to launch crawl page workflow",
              },
            });
          }
        }
      }
      break;
    }
    case "crawl.completed": {
      logger.info(
        { id, metadata, connectorId: connector.id },
        "Crawl completed"
      );
      const launchRes = await launchFirecrawlCrawlCompletedWorkflow(
        connector.id,
        id
      );
      if (!launchRes.isOk()) {
        logger.error(
          { id, metadata, error: launchRes.error },
          "Failed to launch crawl completed workflow"
        );
        return res.status(500).json({
          error: {
            type: "internal_server_error",
            message: "Failed to launch crawl completed workflow",
          },
        });
      }
      break;
    }
    case "crawl.failed": {
      logger.info(
        { id, metadata, connectorId: connector.id, error },
        "Crawl Failed"
      );
      const launchRes = await launchFirecrawlCrawlFailedWorkflow(
        connector.id,
        id
      );
      if (!launchRes.isOk()) {
        logger.error(
          { id, metadata, error: launchRes.error },
          "Failed to launch crawl failed workflow"
        );
        return res.status(500).json({
          error: {
            type: "internal_server_error",
            message: "Failed to launch crawl failed workflow",
          },
        });
      }
      break;
    }
    default:
      assertNever(type);
  }

  return res.status(200).end();
};

export const webhookFirecrawlAPIHandler = withLogging(
  _webhookFirecrawlAPIHandler
);
