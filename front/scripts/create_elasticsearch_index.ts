import { getClient, INDEX_REGISTRY } from "@app/lib/api/elasticsearch";
import { makeScript } from "@app/scripts/helpers";
import { EnvironmentConfig } from "@app/types/shared/utils/config";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

/**
 * Script to create ElasticSearch indices for front service
 *
 * Usage:
 * tsx front/scripts/create_elasticsearch_index.ts [--index-name agent_message_analytics] [--index-version 1] [--skip-confirmation] [--remove-previous-alias] [--execute]
 *
 * Without --index-name, creates every index in INDEX_REGISTRY at its current version, skipping the ones that already exist.
 * INDEX_REGISTRY in lib/api/elasticsearch.ts holds each index's directory and current version.
 * Settings and mappings are loaded from [directory]/[index_name]_[version].settings.[region].json and [directory]/[index_name]_[version].mappings.json.
 * Creates each index at front.[index_name]_[version], and sets the alias to front.[index_name]
 */

makeScript(
  {
    indexName: {
      type: "string",
      describe:
        "The index name (without the version), all registered indices when omitted",
    },
    indexVersion: {
      type: "number",
      describe: "The version of the index, the registered version when omitted",
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
    { indexName, indexVersion, skipConfirmation, removePreviousAlias, execute },
    logger
  ) => {
    if (!indexName && (indexVersion !== undefined || removePreviousAlias)) {
      throw new Error(
        "--index-version and --remove-previous-alias require --index-name"
      );
    }

    const region =
      EnvironmentConfig.getOptionalEnvVariable("NODE_ENV") === "development"
        ? "local"
        : EnvironmentConfig.getEnvVariable("REGION");

    let targets: Array<{ name: string; version: number; directory: string }>;
    if (indexName) {
      const entry = INDEX_REGISTRY[indexName];
      if (!entry) {
        throw new Error(
          `Index '${indexName}' is not configured in INDEX_REGISTRY. ` +
            `Available indices: ${Object.keys(INDEX_REGISTRY).join(", ")}`
        );
      }
      targets = [
        {
          name: indexName,
          version: indexVersion ?? entry.version,
          directory: entry.directory,
        },
      ];
    } else {
      targets = Object.entries(INDEX_REGISTRY).map(([name, entry]) => ({
        name,
        version: entry.version,
        directory: entry.directory,
      }));
    }

    if (removePreviousAlias && targets[0].version === 1) {
      throw new Error("Cannot remove previous alias for version 1");
    }

    const client = await getClient();

    const createOne = async (target: {
      name: string;
      version: number;
      directory: string;
    }) => {
      const indexFullname = `front.${target.name}_${target.version}`;
      const indexAlias = `front.${target.name}`;
      const indexPreviousFullname = `front.${target.name}_${target.version - 1}`;

      logger.info("Configuration:");
      logger.info(`  Index name: ${indexFullname}`);
      logger.info(`  Alias: ${indexAlias}`);
      logger.info(`  Region: ${region}`);
      logger.info(`  Remove previous alias: ${removePreviousAlias}`);
      if (removePreviousAlias) {
        logger.info(`  Previous index: ${indexPreviousFullname}`);
      }

      const indexExists = await client.indices.exists({
        index: indexFullname,
      });

      if (indexExists) {
        if (indexName) {
          throw new Error(`Index ${indexFullname} already exists`);
        }
        logger.info(`Index ${indexFullname} already exists, skipping`);
        return;
      }

      const settingsPath = path.join(
        __dirname,
        `../${target.directory}/${target.name}_${target.version}.settings.${region}.json`
      );
      const mappingsPath = path.join(
        __dirname,
        `../${target.directory}/${target.name}_${target.version}.mappings.json`
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

      if (!skipConfirmation && execute) {
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

      if (!execute) {
        logger.info(
          `[DRY RUN] Would create index ${indexFullname} and alias ${indexAlias}`
        );
        return;
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
    };

    for (const target of targets) {
      await createOne(target);
    }

    logger.info("🎉 Index creation complete!");
  }
);
