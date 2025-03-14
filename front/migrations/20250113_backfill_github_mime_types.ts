import assert from "assert";
import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { GithubMimeType } from "@app/types";
import { MIME_TYPES } from "@app/types";

const { CORE_DATABASE_URI } = process.env;
const BATCH_SIZE = 256;

type GithubContentNodeType = "REPO_CODE" | "REPO_CODE_DIR" | "REPO_CODE_FILE";

/**
 * Gets the type of the GitHub content node from its internal id.
 * Copy-pasted from connectors/src/connectors/github/lib/utils.ts
 */
function matchGithubInternalIdType(internalId: string): {
  type: GithubContentNodeType;
  repoId: number;
} {
  // All code from repo is selected, format = "github-code-12345678"
  if (/^github-code-\d+$/.test(internalId)) {
    return {
      type: "REPO_CODE",
      repoId: parseInt(internalId.replace(/^github-code-/, ""), 10),
    };
  }
  // A code directory is selected, format = "github-code-12345678-dir-s0Up1n0u"
  if (/^github-code-\d+-dir-[a-f0-9]+$/.test(internalId)) {
    return {
      type: "REPO_CODE_DIR",
      repoId: parseInt(
        internalId.replace(/^github-code-(\d+)-dir-.*/, "$1"),
        10
      ),
    };
  }
  // A code file is selected, format = "github-code-12345678-file-s0Up1n0u"
  if (/^github-code-\d+-file-[a-f0-9]+$/.test(internalId)) {
    return {
      type: "REPO_CODE_FILE",
      repoId: parseInt(
        internalId.replace(/^github-code-(\d+)-file-.*/, "$1"),
        10
      ),
    };
  }
  throw new Error(`Invalid Github internal id (code-only): ${internalId}`);
}

function getMimeTypeForNodeId(nodeId: string): GithubMimeType {
  switch (matchGithubInternalIdType(nodeId).type) {
    case "REPO_CODE":
      return MIME_TYPES.GITHUB.CODE_ROOT;
    case "REPO_CODE_DIR":
      return MIME_TYPES.GITHUB.CODE_DIRECTORY;
    case "REPO_CODE_FILE":
      return MIME_TYPES.GITHUB.CODE_FILE;
    default:
      throw new Error(`Unreachable: unrecognized node_id: ${nodeId}`);
  }
}

async function backfillDataSource(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing data source");

  let nextId = 0;
  let updatedRowsCount;
  do {
    const rows: { id: number; node_id: string; mime_type: string }[] =
      await coreSequelize.query(
        `
          SELECT dsn.id, dsn.node_id, dsn.mime_type
          FROM data_sources_nodes dsn
                   JOIN data_sources ds ON ds.id = dsn.data_source
          WHERE dsn.id > :nextId
            AND ds.data_source_id = :dataSourceId
            AND ds.project = :projectId
            AND dsn.node_id LIKE 'github-code-%' -- leverages the btree
          ORDER BY dsn.id
          LIMIT :batchSize;`,
        {
          replacements: {
            dataSourceId: frontDataSource.dustAPIDataSourceId,
            projectId: frontDataSource.dustAPIProjectId,
            batchSize: BATCH_SIZE,
            nextId,
          },
          type: QueryTypes.SELECT,
        }
      );

    if (rows.length == 0) {
      logger.info({ nextId }, `Finished processing data source.`);
      break;
    }
    nextId = rows[rows.length - 1].id;
    updatedRowsCount = rows.length;

    if (execute) {
      await coreSequelize.query(
        `WITH pairs AS (
            SELECT UNNEST(ARRAY[:ids]) as id, UNNEST(ARRAY[:mimeTypes]) as mime_type
        )
         UPDATE data_sources_nodes dsn
         SET mime_type = p.mime_type
         FROM pairs p
         WHERE dsn.id = p.id;`,
        {
          replacements: {
            mimeTypes: rows.map((row) => getMimeTypeForNodeId(row.node_id)),
            ids: rows.map((row) => row.id),
          },
        }
      );
      logger.info(
        `Updated chunk from ${rows[0].id} to ${rows[rows.length - 1].id}`
      );
    } else {
      logger.info(
        {
          nodes: rows.map((row) => ({
            nodeId: row.node_id,
            fromMimeType: row.mime_type,
            toMimeType: getMimeTypeForNodeId(row.node_id),
          })),
        },
        `Would update chunk from ${rows[0].id} to ${rows[rows.length - 1].id}`
      );
    }
  } while (updatedRowsCount === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  assert(CORE_DATABASE_URI, "CORE_DATABASE_URI is required");

  const coreSequelize = getCorePrimaryDbConnection();

  const frontDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "github" },
  });
  logger.info(`Found ${frontDataSources.length} GitHub data sources`);

  for (const frontDataSource of frontDataSources) {
    await backfillDataSource(
      frontDataSource,
      coreSequelize,
      execute,
      logger.child({
        dataSourceId: frontDataSource.id,
        connectorId: frontDataSource.connectorId,
      })
    );
  }
});
