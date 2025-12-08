/**
 * Move a given percentage of the webcrawler to a given crawler
 */

import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import fs from "fs";
import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";
import { promisify } from "util";
import z from "zod";

import { WebCrawlerConfigurationModel } from "@connectors/lib/models/webcrawler";
import logger from "@connectors/logger/logger";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import { concurrentExecutor } from "@connectors/types";

async function readJSON(filename: string): Promise<Result<string[], Error>> {
  if (!fs.existsSync(filename)) {
    return new Err(new Error(`"${filename}" doesn't exist`));
  }

  try {
    const content = await promisify(fs.readFile)(filename, "utf-8");
    return new Ok(content.split("\n"));
  } catch (err) {
    if (err instanceof Error) {
      return new Err(err);
    }
    throw err;
  }
}

makeScript(
  {
    percentage: { type: "number", require: true },
    skippedWorkspaceFile: { type: "string" },
    forcedWorkspaceFile: { type: "string" },
    crawler: { type: "string", default: null },
  },
  async ({
    execute,
    percentage,
    skippedWorkspaceFile,
    forcedWorkspaceFile,
    crawler,
  }) => {
    const parsePercentageResponse = z.coerce
      .number({ invalid_type_error: "percentage is not a valid number" })
      .gt(0, "Percentage must be higher than 0")
      .lte(100, "Percentage must be 100 or lower")
      .safeParse(percentage);

    if (parsePercentageResponse.error) {
      logger.error(parsePercentageResponse.error.message);
      return;
    }

    if (
      crawler !== null &&
      crawler !== "firecrawl" &&
      crawler !== "firecrawl-api"
    ) {
      logger.error(
        `"${crawler}" is not a valid crawler option, only null, "firecrawl" or "firecrawl-api" are allowed`
      );
      return;
    }

    let skippedWorkspaces: string[] = [];
    if (skippedWorkspaceFile) {
      const res = await readJSON(skippedWorkspaceFile);
      if (res.isErr()) {
        logger.error(res.error);
        return;
      }
      skippedWorkspaces = res.value;
    }

    let forcedWorkspaces: string[] = [];
    if (forcedWorkspaceFile) {
      const res = await readJSON(forcedWorkspaceFile);
      if (res.isErr()) {
        logger.error(res.error);
        return;
      }
      forcedWorkspaces = res.value;
    }

    const webcrawlerConfigs = await WebCrawlerConfigurationModel.findAll({
      where: {
        // @ts-expect-error -- Dropped column
        customCrawler: {
          [Op.not]: crawler,
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
              ...(forcedWorkspaces.length > 0
                ? { [Op.in]: forcedWorkspaces }
                : {}),
            },
          },
        },
      ],
    });

    logger.info(`Found ${webcrawlerConfigs.length} webcrawler configuration`);

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
        async (c) =>
          WebCrawlerConfigurationModel.update(
            // @ts-expect-error -- Dropped column
            { customCrawler: crawler },
            { where: { id: c.id } }
          ),
        { concurrency: 10 }
      );
      logger.info(
        `Set "customCrawler" to "${crawler}" for ${webcrawlerConfigsToMigrate.length} webcrawler configurations`
      );
    } else {
      logger.info("Not executing update");
    }
  }
);
