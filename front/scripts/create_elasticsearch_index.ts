import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

import { getClient, INDEX_DIRECTORIES } from "@app/lib/api/elasticsearch";
import { makeScript } from "@app/scripts/helpers";
import { EnvironmentConfig } from "@app/types";

/**
 * Script to create an ElasticSearch index for front service
 *
 * Usage:
 * tsx front/scripts/create_elasticsearch_index.ts --index-name agent_message_analytics --index-version 1 [--skip-confirmation] [--remove-previous-alias]
 *
 * The script looks up the index directory from INDEX_DIRECTORIES in lib/api/elasticsearch.ts
 * Then loads settings and mappings from [directory]/[index_name]_[version].settings.[region].json and [directory]/[index_name]_[version].mappings.json
 * Creates the index at front.[index_name]_[version], and sets the alias to front.[index_name]
 */

makeScript(
  {
    indexName: {
      type: "string",
      describe: "The index name (without the version)",
      demandOption: true,
    },
    indexVersion: {
      type: "number",
      describe: "The version of the index",
      demandOption: true,
    },
    skipConfirmation: {
      type: "boolean",
      describe: "Skip confirmation",
      default: false,
    },
    removePreviousAlias: {
      type: "boolean",
      describe: "Remove previous alias",
      default: false,
    },
  },
  async (
    { indexName, indexVersion, skipConfirmation, removePreviousAlias },
    logger
  ) => {
    if (removePreviousAlias && indexVersion === 1) {
      throw new Error("Cannot remove previous alias for version 1");
    }

    const indexFullname = `front.${indexName}_${indexVersion}`;
    const indexAlias = `front.${indexName}`;
    const indexPreviousFullname = `front.${indexName}_${indexVersion - 1}`;

    const region =
      EnvironmentConfig.getOptionalEnvVariable("NODE_ENV") === "development"
        ? "local"
        : EnvironmentConfig.getEnvVariable("REGION");

    logger.info("Configuration:");
    logger.info(`  Index name: ${indexFullname}`);
    logger.info(`  Alias: ${indexAlias}`);
    logger.info(`  Region: ${region}`);
    logger.info(`  Remove previous alias: ${removePreviousAlias}`);
    if (removePreviousAlias) {
      logger.info(`  Previous index: ${indexPreviousFullname}`);
    }

    const client = await getClient();

    const indexExists = await client.indices.exists({
      index: indexFullname,
    });

    if (indexExists) {
      throw new Error(`Index ${indexFullname} already exists`);
    }

    // Get the directory for this index from the mapping
    const indexDirectory = INDEX_DIRECTORIES[indexName];
    if (!indexDirectory) {
      throw new Error(
        `Index '${indexName}' is not configured in INDEX_DIRECTORIES. ` +
          `Available indices: ${Object.keys(INDEX_DIRECTORIES).join(", ")}`
      );
    }

    const settingsPath = path.join(
      __dirname,
      `../${indexDirectory}/${indexName}_${indexVersion}.settings.${region}.json`
    );
    const mappingsPath = path.join(
      __dirname,
      `../${indexDirectory}/${indexName}_${indexVersion}.mappings.json`
    );

    let settingsRaw: string;
    let mappingsRaw: string;

    try {
      settingsRaw = fs.readFileSync(settingsPath, "utf8");
    } catch (err) {
      throw new Error(
        `Failed to read settings file at ${settingsPath}: ${err}`
      );
    }

    try {
      mappingsRaw = fs.readFileSync(mappingsPath, "utf8");
    } catch (err) {
      throw new Error(
        `Failed to read mappings file at ${mappingsPath}: ${err}`
      );
    }

    let settings: Record<string, unknown>;
    let mappings: Record<string, unknown>;

    try {
      settings = JSON.parse(settingsRaw);
    } catch (err) {
      throw new Error(
        `Failed to parse settings file at ${settingsPath}: ${err}`
      );
    }

    try {
      mappings = JSON.parse(mappingsRaw);
    } catch (err) {
      throw new Error(
        `Failed to parse mappings file at ${mappingsPath}: ${err}`
      );
    }

    if (!skipConfirmation) {
      logger.info(
        `CHECK: Create index '${indexFullname}' with alias '${indexAlias}' in region '${region}' (remove previous alias: ${removePreviousAlias})? (y to confirm)`
      );

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question("", (input) => {
          rl.close();
          resolve(input.trim());
        });
      });

      if (answer !== "y") {
        throw new Error("Aborted");
      }
    }

    logger.info(`Creating index ${indexFullname}...`);

    const indexCreationResponse = await client.indices.create({
      index: indexFullname,
      settings,
      mappings,
    });

    if (!indexCreationResponse.acknowledged) {
      throw new Error(
        `Failed to create index: ${JSON.stringify(indexCreationResponse)}`
      );
    }

    logger.info(`✅ Index created: ${indexFullname}`);

    const aliasActions: Array<
      | { add: { index: string; alias: string; is_write_index: boolean } }
      | { remove: { index: string; alias: string } }
    > = [
      {
        add: {
          index: indexFullname,
          alias: indexAlias,
          is_write_index: true,
        },
      },
    ];

    if (removePreviousAlias) {
      aliasActions.push({
        remove: {
          index: indexPreviousFullname,
          alias: indexAlias,
        },
      });
    }

    logger.info(`Creating alias ${indexAlias}...`);

    const aliasCreationResponse = await client.indices.updateAliases({
      actions: aliasActions,
    });

    if (!aliasCreationResponse.acknowledged) {
      throw new Error(
        `Failed to create alias: ${JSON.stringify(aliasCreationResponse)}`
      );
    }

    logger.info(`✅ Alias created: ${indexAlias}`);
    logger.info("🎉 Index creation complete!");
  }
);
