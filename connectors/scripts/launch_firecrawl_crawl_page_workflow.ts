import { launchFirecrawlCrawlPageWorkflow } from "@connectors/connectors/webcrawler/temporal/client";

import { makeScript } from "./helpers";

makeScript(
  {
    connectorId: {
      type: "number",
      demandOption: true,
      description: "Connector ID",
    },
    crawlId: {
      type: "string",
      demandOption: true,
      description: "Crawl ID from Firecrawl",
    },
    scrapeId: {
      type: "string",
      demandOption: true,
      description: "Scrape ID from Firecrawl",
    },
  },
  async (args, logger) => {
    const result = await launchFirecrawlCrawlPageWorkflow(
      args.connectorId,
      args.crawlId,
      args.scrapeId
    );
    if (result.isErr()) {
      logger.error({ error: result.error }, "Failed to launch workflow");
      throw result.error;
    }
    logger.info({ workflowId: result.value }, "Workflow launched");
  }
);
