import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import {
  getConnectorsReplicaDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const BATCH_SIZE = 256;

// Functions to get urls for GitHub resources: copied from connectors.

function getIssuesUrl(repoUrl: string): string {
  return `${repoUrl}/issues`;
}

function getDiscussionsUrl(repoUrl: string): string {
  return `${repoUrl}/discussions`;
}

// Functions to generate internal IDs for GitHub resources: copied from connectors.

function getRepositoryInternalId(repoId: string | number): string {
  return `github-repository-${repoId}`;
}

function getIssuesInternalId(repoId: string | number): string {
  return `github-issues-${repoId}`;
}

function getDiscussionsInternalId(repoId: string | number): string {
  return `github-discussions-${repoId}`;
}
function getCodeRootInternalId(repoId: string | number): string {
  return `github-code-${repoId}`;
}

async function updateNodes(
  coreSequelize: Sequelize,
  dataSourceId: number,
  nodeIds: string[],
  urls: string[]
) {
  await coreSequelize.query(
    `UPDATE data_sources_nodes
     SET source_url = urls.url
     FROM (SELECT unnest(ARRAY [:nodeIds]::text[]) as node_id,
                  unnest(ARRAY [:urls]::text[])    as url) urls
     WHERE data_sources_nodes.data_source = :dataSourceId AND data_sources_nodes.node_id = urls.node_id;`,
    { replacements: { urls, nodeIds, dataSourceId } }
  );
}

async function backfillAllCodeDirs({
  coreSequelize,
  connectorsSequelize,
  frontDataSource,
  coreDataSourceId,
  execute,
  logger,
}: {
  coreSequelize: Sequelize;
  connectorsSequelize: Sequelize;
  frontDataSource: DataSourceModel;
  coreDataSourceId: number;
  execute: boolean;
  logger: typeof Logger;
}) {
  logger.info("Processing directories");

  let nextId = 0;
  let updatedRowsCount;
  do {
    const rows: { id: number; internalId: string; sourceUrl: string }[] =
      await connectorsSequelize.query(
        `
          SELECT gcd.id, gcd."internalId", gcd."sourceUrl"
          FROM github_code_directories gcd
          WHERE gcd.id > :nextId
          AND gcd."connectorId" = :connectorId
          ORDER BY gcd.id
          LIMIT :batchSize;`,
        {
          replacements: {
            batchSize: BATCH_SIZE,
            nextId,
            connectorId: frontDataSource.connectorId,
          },
          type: QueryTypes.SELECT,
        }
      );

    if (rows.length == 0) {
      logger.info({ nextId }, `Finished processing directories.`);
      break;
    }
    nextId = rows[rows.length - 1].id;
    updatedRowsCount = rows.length;

    const urls = rows.map((row) => row.sourceUrl);
    const nodeIds = rows.map((row) => {
      return row.internalId;
    });
    if (execute) {
      await updateNodes(coreSequelize, coreDataSourceId, nodeIds, urls);
      logger.info(`Updated ${rows.length} code directories.`);
    } else {
      logger.info(
        `Would update ${rows.length} nodes, sample: ${nodeIds.slice(0, 5).join(", ")}, ${urls.slice(0, 5).join(", ")}`
      );
    }
  } while (updatedRowsCount === BATCH_SIZE);
}

async function backfillAllMetaNodes({
  coreSequelize,
  connectorsSequelize,
  frontDataSource,
  coreDataSourceId,
  execute,
  logger,
}: {
  coreSequelize: Sequelize;
  connectorsSequelize: Sequelize;
  frontDataSource: DataSourceModel;
  coreDataSourceId: number;
  execute: boolean;
  logger: typeof Logger;
}) {
  logger.info("Processing repo nodes");

  let nextId = 0;
  let updatedRowsCount;
  do {
    const rows: { id: number; repoId: string; sourceUrl: string }[] =
      await connectorsSequelize.query(
        `
          SELECT gcr.id, gcr."repoId", gcr."sourceUrl"
          FROM github_code_repositories gcr
          WHERE gcr.id > :nextId
          AND gcr."connectorId" = :connectorId
          ORDER BY gcr.id
          LIMIT :batchSize;`,
        {
          replacements: {
            batchSize: BATCH_SIZE,
            nextId,
            connectorId: frontDataSource.connectorId,
          },
          type: QueryTypes.SELECT,
        }
      );

    if (rows.length == 0) {
      logger.info({ nextId }, `Finished processing repo nodes.`);
      break;
    }
    nextId = rows[rows.length - 1].id;
    updatedRowsCount = rows.length;

    // We backfill 'Code', 'Issues', 'Discussions' and repo nodes in one go.
    const repoUrls = rows.map((row) => row.sourceUrl);
    const repoNodeIds = rows.map((row) => {
      return getRepositoryInternalId(row.repoId);
    });
    const discussionNodeIds = rows.map((row) => {
      return getDiscussionsInternalId(row.repoId);
    });
    const discussionUrls = rows.map((row) => {
      return getDiscussionsUrl(row.sourceUrl);
    });
    const issuesNodeIds = rows.map((row) => {
      return getIssuesInternalId(row.repoId);
    });
    const issuesUrls = rows.map((row) => {
      return getIssuesUrl(row.sourceUrl);
    });
    const codeRootNodeIds = rows.map((row) => {
      return getCodeRootInternalId(row.repoId);
    });
    const codeRootUrls = repoUrls;
    if (execute) {
      await updateNodes(coreSequelize, coreDataSourceId, repoNodeIds, repoUrls);
      await updateNodes(
        coreSequelize,
        coreDataSourceId,
        discussionNodeIds,
        discussionUrls
      );
      await updateNodes(
        coreSequelize,
        coreDataSourceId,
        issuesNodeIds,
        issuesUrls
      );
      await updateNodes(
        coreSequelize,
        coreDataSourceId,
        codeRootNodeIds,
        codeRootUrls
      );
      logger.info(`Updated ${rows.length * 4} meta nodes.`);
    } else {
      logger.info(
        `Would update ${rows.length * 4} meta nodes, sample for repo: ${repoNodeIds.slice(0, 5).join(", ")}, ${repoUrls.slice(0, 5).join(", ")}`
      );
    }
  } while (updatedRowsCount === BATCH_SIZE);
}

async function getCoreDataSourceId(
  frontDataSource: DataSourceModel,
  coreSequelize: Sequelize,
  logger: typeof Logger
) {
  // get datasource id from core
  const rows: { id: number }[] = await coreSequelize.query(
    `SELECT id FROM data_sources WHERE data_source_id = :dataSourceId;`,
    {
      replacements: { dataSourceId: frontDataSource.dustAPIDataSourceId },
      type: QueryTypes.SELECT,
    }
  );

  if (rows.length === 0) {
    logger.error(`Data source ${frontDataSource.id} not found in core`);
    return null;
  }

  return rows[0].id;
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();

  // No need for pagination, only 127 of them
  const frontDataSources = await DataSourceModel.findAll({
    where: { connectorProvider: "github" },
  });
  logger.info(`Found ${frontDataSources.length} GitHub data sources`);
  for (const frontDataSource of frontDataSources) {
    const coreDataSourceId = await getCoreDataSourceId(
      frontDataSource,
      coreSequelize,
      logger
    );

    if (coreDataSourceId === null) {
      continue;
    }

    await backfillAllMetaNodes({
      coreSequelize,
      connectorsSequelize,
      frontDataSource,
      coreDataSourceId,
      execute,
      logger,
    });
    await backfillAllCodeDirs({
      coreSequelize,
      connectorsSequelize,
      frontDataSource,
      coreDataSourceId,
      execute,
      logger,
    });
  }
});
