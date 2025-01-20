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
      [getRepositoryInternalId(repoId)],
      [repoUrl]
    );
    await updateNodes(
      coreSequelize,
      coreDataSourceId,
      [getDiscussionsInternalId(repoId)],
      [getDiscussionsUrl(repoUrl)]
    );
    await updateNodes(
      coreSequelize,
      coreDataSourceId,
      [getIssuesInternalId(repoId)],
      [getIssuesUrl(repoUrl)]
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
    const repoId = row.node_id.split("-")[2];
    return { repoId, dataSourceId: row.data_source };
  });
}

async function getRepoUrl(repoId: string, coreSequelize: Sequelize) {
  const issueIdLike = `github-issue-${repoId}-%`;
  const discussionIdLike = `github-discussion-${repoId}-%`;
  const rows: { source_url: string; mime_type: string }[] =
    await coreSequelize.query(
      // Get source url for issues or discussions, but not PRs
      `SELECT source_url, mime_type 
    FROM data_sources_nodes 
    WHERE (node_id LIKE :issueIdLike OR node_id LIKE :discussionIdLike) AND source_url IS NOT NULL AND source_url NOT LIKE '%/pull/%' 
    LIMIT 1;`,
      {
        replacements: { issueIdLike, discussionIdLike },
        type: QueryTypes.SELECT,
      }
    );
  if (rows.length === 0) {
    return null;
  }
  if (rows[0].mime_type.includes("issue")) {
    // turn the issue url into a repo url, e.g. https://github.com/dust-tt/dust/issues/10083 -> https://github.com/dust-tt/dust
    const issueUrl = rows[0].source_url;
    const repoUrl = issueUrl.replace(/\/issues\/\d+$/, "");
    return repoUrl;
  } else if (rows[0].mime_type.includes("discussion")) {
    // turn the discussion url into a repo url, e.g. https://github.com/dust-tt/dust/discussions/10083 -> https://github.com/dust-tt/dust
    const discussionUrl = rows[0].source_url;
    const repoUrl = discussionUrl.replace(/\/discussions\/\d+$/, "");
    return repoUrl;
  }
  return null;
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
