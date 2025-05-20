/**
 * Move webcrawler_configurations that have their connector errorType = webcrawling_error_empty_content to customCrawler = firecrawl
 * They mustn't be part of a enterprise workspace
 */
import fs from "fs";
import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import { WebCrawlerConfigurationModel } from "@connectors/lib/models/webcrawler";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

makeScript(
  {
    skippedWorkspaceFile: { type: "string", required: true },
  },
  async ({ execute, skippedWorkspaceFile }, logger) => {
    if (!fs.existsSync(skippedWorkspaceFile)) {
      logger.error(`File "${skippedWorkspaceFile}" doesn't exist`);
      return;
    }

    const workspaceFileContent = fs.readFileSync(skippedWorkspaceFile, "utf-8");
    const workspaceIds = workspaceFileContent.split("\n");
    logger.info(`${workspaceIds.length} workspaces will be skipped`);

    const webcrawlerConfigs = await WebCrawlerConfigurationModel.findAll({
      where: {
        customCrawler: {
          [Op.is]: null,
        },
      },
      include: [
        {
          model: ConnectorModel,
          as: "connector",
          where: {
            type: "webcrawler",
            errorType: "webcrawling_error_empty_content",
            workspaceId: {
              [Op.notIn]: workspaceIds,
            },
          },
        },
      ],
    });

    logger.info(
      `Found ${webcrawlerConfigs.length} webcrawler configuration that are webcrawler, with empty error state and not in the given workspaces`
    );

    if (execute) {
      logger.info("Will execute");
      for (const crawler of webcrawlerConfigs) {
        await crawler.update("customCrawler", "firecrawl");
      }
      logger.info(
        `Set "customCrawler" to "firecrawl" for ${webcrawlerConfigs.length} webcrawler configurations`
      );
    } else {
      logger.info("Not executing update");
    }
  }
);
