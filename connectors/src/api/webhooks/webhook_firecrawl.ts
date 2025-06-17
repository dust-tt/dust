import { assertNever } from "@dust-tt/client";
import type { Request, Response } from "express";

import mainLogger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

const logger = mainLogger.child({
  provider: "webcrawler",
  service: "firecrawl",
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
          [key: string]: unknown;
        };
      }>;
      metadata: {
        [key: string]: unknown;
      };
      error: string | null;
    }
  >,
  res: Response<FirecrawlWebhookResBody>
) => {
  const { success, type, id, data, metadata, error } = req.body;
  logger.info("[Firecrwal] Received webhook", {
    success,
    type,
    id,
    metadata,
    error,
  });

  switch (type) {
    case "crawl.started": {
      logger.info({ id, metadata }, "[Firecrawl] Crawl started");
      break;
    }
    case "crawl.page": {
      if (data && data.length > 0 && data[0]) {
        // Note: we receive the data here and we won't be able to get back to it by API based on the
        // documentation (to be confirmed). If not we will want to put it in redis or GCS
        // temporarily for later processing through a workflow.
        logger.info(
          { id, sourceURL: data[0].metadata.sourceURL, metadata },
          "[Firecrawl] Page crawled"
        );
      } else {
        logger.warn({ id, metadata }, "[Firecrawl] Page crawled with no data");
      }
      break;
    }
    case "crawl.completed": {
      logger.info({ id, metadata }, "[Firecrawl] Crawl completed");
      break;
    }
    case "crawl.failed": {
      logger.error({ id, metadata, error }, "[Firecrawl] Crawl failed");
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
