import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

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

async function backfillMetaNodes({
  coreSequelize,
  coreDataSourceId,
  repoId,
  repoUrl,
  execute,
  logger,
}: {
  coreSequelize: Sequelize;
  coreDataSourceId: number;
  repoId: string;
  repoUrl: string;
  execute: boolean;
  logger: typeof Logger;
}) {
  if (execute) {
    await updateNodes(
      coreSequelize,
      coreDataSourceId,
      getRepositoryInternalId(repoId),
      repoUrl
    );
    await updateNodes(
      coreSequelize,
      coreDataSourceId,
      getDiscussionsInternalId(repoId),
      getDiscussionsUrl(repoUrl)
    );
    await updateNodes(
      coreSequelize,
      coreDataSourceId,
      getIssuesInternalId(repoId),
      getIssuesUrl(repoUrl)
    );
    logger.info(`Updated source urls for repo ${repoId} -> ${repoUrl}.`);
  } else {
    logger.info(`Would update source urls for repo ${repoId} -> ${repoUrl}.`);
  }
}

async function getCodeNonSyncedRepos(coreSequelize: Sequelize) {
  const rows: { node_id: string; data_source: number }[] =
    await coreSequelize.query(
      `SELECT node_id, data_source FROM data_sources_nodes WHERE node_id LIKE 'github-issues-%' AND source_url IS NULL;`,
      {
        type: QueryTypes.SELECT,
      }
    );
  return rows.map((row) => {
    if (!/^github-issues-\d+$/.test(row.node_id)) {
      throw new Error(`Invalid node_id: ${row.node_id}`);
    }
    const repoId = row.node_id.replace(/^github-issues-/, "");
    return { repoId, dataSourceId: row.data_source };
  });
}

async function getRepoUrl(repoId: string, coreSequelize: Sequelize) {
  const issueIdLike = `github-issue-${repoId}-%`;
  const rows: { source_url: string; node_id: string; mime_type: string }[] =
    await coreSequelize.query(
      `SELECT source_url, node_id, mime_type 
    FROM data_sources_nodes 
    WHERE node_id LIKE :issueIdLike AND source_url IS NOT NULL 
    LIMIT 1;`,
      {
        replacements: { issueIdLike },
        type: QueryTypes.SELECT,
      }
    );
  if (rows.length === 0) {
    return null;
  }
  if (rows[0].source_url.includes("/issues/")) {
    // turn the issue url into a repo url, e.g. https://github.com/dust-tt/dust/issues/10083 -> https://github.com/dust-tt/dust
    const issueUrl = rows[0].source_url;
    const repoUrl = issueUrl.replace(/\/issues\/\d+$/, "");
    return repoUrl;
  } else if (rows[0].source_url.includes("/pull/")) {
    // turn the pr url into a repo url, e.g. https://github.com/dust-tt/dust/pull/10083 -> https://github.com/dust-tt/dust
    const prUrl = rows[0].source_url;
    const repoUrl = prUrl.replace(/\/pull\/\d+$/, "");
    return repoUrl;
  }
  return null;
}

async function updateNodes(
  coreSequelize: Sequelize,
  dataSourceId: number,
  nodeId: string,
  url: string
) {
  await coreSequelize.query(
    `UPDATE data_sources_nodes
     SET source_url = :url
     WHERE data_source = :dataSourceId AND node_id = :nodeId;`,
    { replacements: { url, dataSourceId, nodeId } }
  );
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();

  // Get all repos whose source_url is missing on some meta node (looking at issues)
  const nonSyncedRepos = await getCodeNonSyncedRepos(coreSequelize);
  console.log(nonSyncedRepos.length, "non synced repos:");
  console.log(nonSyncedRepos.map((r) => r.repoId).join(", "));

  for (const repo of nonSyncedRepos) {
    const repoUrl = await getRepoUrl(repo.repoId, coreSequelize);
    if (repoUrl === null) {
      logger.error(`No repo url found for repo ${repo.repoId}.`);
      continue;
    }
    await backfillMetaNodes({
      coreSequelize,
      coreDataSourceId: repo.dataSourceId,
      repoId: repo.repoId,
      repoUrl,
      execute,
      logger,
    });
  }
});
