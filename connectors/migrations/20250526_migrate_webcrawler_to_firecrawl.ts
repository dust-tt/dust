/**
 * Move a given percentage of the remaining webcrawler to firecrawl
 */

import fs from "fs";
import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";
import { promisify } from "util";
import z from "zod";

import { WebCrawlerConfigurationModel } from "@connectors/lib/models/webcrawler";
import logger from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import { concurrentExecutor } from "@connectors/types";

makeScript(
  {
    percentage: { type: "number", require: true },
    skippedWorkspaceFile: { type: "string" },
  },
  async ({ execute, percentage, skippedWorkspaceFile }) => {
    const parsePercentageResponse = z.coerce
      .number({ invalid_type_error: "percentage is not a valid number" })
      .gt(0, "Percentage must be higher than 0")
      .lte(100, "Percentage must be 100 or lower")
      .safeParse(percentage);

    if (parsePercentageResponse.error) {
      logger.error(parsePercentageResponse.error.message);
      return;
    }

    let skippedWorkspaces: string[] = [];
    if (skippedWorkspaceFile) {
      if (!fs.existsSync(skippedWorkspaceFile)) {
        logger.error(`"${skippedWorkspaceFile}" doesn't exist`);
        return;
      }

      try {
        const content = await promisify(fs.readFile)(
          skippedWorkspaceFile,
          "utf-8"
        );
        skippedWorkspaces = content.split("\n");
        logger.info(`Got ${skippedWorkspaces.length} workspaces to skip`);
      } catch (err) {
        logger.error({ err }, `Couldn't read file "${skippedWorkspaceFile}"`);
        return;
      }
    }

    const webcrawlerConfigs = await WebCrawlerConfigurationModel.findAll({
      where: {
        // @ts-expect-error -- Dropped column
        customCrawler: {
          [Op.is]: null,
        },
      },
      include: [
        {
          model: ConnectorModel,
          required: true,
          as: "connector",
          where: {
            type: "webcrawler",
            workspaceId: {
              [Op.notIn]: skippedWorkspaces,
            },
          },
        },
      ],
    });

    logger.info(
      `Found ${webcrawlerConfigs.length} webcrawler configuration that are not on firecrawl, and not in the given workspaces`
    );

    const numbersOfConfigs = Math.floor(
      webcrawlerConfigs.length * (percentage / 100)
    );
    logger.info(`${numbersOfConfigs} will be migrated`);

    const webcrawlerConfigsToMigrate = webcrawlerConfigs.slice(
      0,
      numbersOfConfigs
    );

    if (execute) {
      logger.info("Will execute");
      await concurrentExecutor(
        webcrawlerConfigsToMigrate,
        async (crawler) =>
          WebCrawlerConfigurationModel.update(
            // @ts-expect-error -- Dropped column
            { customCrawler: "firecrawl" },
            { where: { id: crawler.id } }
          ),
        { concurrency: 10 }
      );
      logger.info(
        `Set "customCrawler" to "firecrawl" for ${webcrawlerConfigsToMigrate.length} webcrawler configurations`
      );
    } else {
      logger.info("Not executing update");
    }
  }
);
