import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import {
  getConnectorsReplicaDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
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

// Must match https://docs.github.com/en/rest/issues/issues#get-an-issue
function getIssueUrl(repoUrl: string, issueNumber: number): string {
  return `${repoUrl}/issues/${issueNumber}`;
}

function getDiscussionUrl(repoUrl: string, discussionNumber: number): string {
  return `${repoUrl}/discussions/${discussionNumber}`;
}

// Functions to generate internal IDs for GitHub resources: copied from connectors.

function getRepositoryInternalId(repoId: string | number): string {
  return `github-repository-${repoId}`;
}

function getIssuesInternalId(repoId: string | number): string {
  return `github-issues-${repoId}`;
}

function getIssueInternalId(
  repoId: string | number,
  issueNumber: number
): string {
  return `github-issue-${repoId}-${issueNumber}`;
}

function getDiscussionsInternalId(repoId: string | number): string {
  return `github-discussions-${repoId}`;
}

function getDiscussionInternalId(
  repoId: string | number,
  discussionNumber: number
): string {
  return `github-discussion-${repoId}-${discussionNumber}`;
}

function getCodeRootInternalId(repoId: string | number): string {
  return `github-code-${repoId}`;
}

async function updateNodes(
  coreSequelize: Sequelize,
  nodeIds: string[],
  urls: string[]
) {
  await coreSequelize.query(
    `UPDATE data_sources_nodes
     SET source_url = urls.url
     FROM (SELECT unnest(ARRAY [:nodeIds]::text[]) as node_id,
                  unnest(ARRAY [:urls]::text[])    as url) urls
     WHERE data_sources_nodes.node_id = urls.node_id;`,
    { replacements: { urls, nodeIds } }
  );
}

async function backfillIssuesForRepo(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  repoId: string,
  repoUrl: string,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing issues");

  let nextId = 0;
  let updatedRowsCount;
  do {
    const rows: { issueNumber: number; id: number }[] =
      await connectorsSequelize.query(
        `
          SELECT gi.id, gi."issueNumber"
          FROM github_issues gi
          WHERE gi."repoId" = :repoId
          AND gi.id > :nextId
          ORDER BY gi.id
          LIMIT :batchSize;`,
        {
          replacements: {
            repoId,
            batchSize: BATCH_SIZE,
            nextId,
          },
          type: QueryTypes.SELECT,
        }
      );

    if (rows.length == 0) {
      logger.info({ nextId }, `Finished processing issues for repo ${repoId}.`);
      break;
    }
    nextId = rows[rows.length - 1].id;
    updatedRowsCount = rows.length;

    const urls = rows.map((row) => getIssueUrl(repoUrl, row.issueNumber));
    const nodeIds = rows.map((row) => {
      return getIssueInternalId(repoId, row.issueNumber);
    });
    if (execute) {
      await updateNodes(coreSequelize, nodeIds, urls);
      logger.info(`Updated ${rows.length} issues.`);
    } else {
      logger.info(
        `Would update ${rows.length} nodes, sample: ${nodeIds.slice(0, 5).join(", ")}, ${urls.slice(0, 5).join(", ")}`
      );
    }
  } while (updatedRowsCount === BATCH_SIZE);
}

async function backfillDiscussionsForRepo(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  repoId: string,
  repoUrl: string,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing discussions");

  let nextId = 0;
  let updatedRowsCount;
  do {
    const rows: { discussionNumber: number; id: number }[] =
      await connectorsSequelize.query(
        `
          SELECT gd."discussionNumber", gd.id
          FROM github_discussions gd
          WHERE gd."repoId" = :repoId
          AND gd.id > :nextId
          ORDER BY gd.id
          LIMIT :batchSize;`,
        {
          replacements: {
            repoId,
            batchSize: BATCH_SIZE,
            nextId,
          },
          type: QueryTypes.SELECT,
        }
      );

    if (rows.length == 0) {
      logger.info(
        { nextId },
        `Finished processing discussions for repo ${repoId}.`
      );
      break;
    }
    nextId = rows[rows.length - 1].id;
    updatedRowsCount = rows.length;

    const urls = rows.map((row) =>
      getDiscussionUrl(repoUrl, row.discussionNumber)
    );
    const nodeIds = rows.map((row) => {
      return getDiscussionInternalId(repoId, row.discussionNumber);
    });
    if (execute) {
      await updateNodes(coreSequelize, nodeIds, urls);
      logger.info(`Updated ${rows.length} discussions.`);
    } else {
      logger.info(
        `Would update ${rows.length} nodes, sample: ${nodeIds.slice(0, 5).join(", ")}, ${urls.slice(0, 5).join(", ")}`
      );
    }
  } while (updatedRowsCount === BATCH_SIZE);
}

async function backfillAllCodeDirs(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
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
          ORDER BY gcd.id
          LIMIT :batchSize;`,
        {
          replacements: {
            batchSize: BATCH_SIZE,
            nextId,
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
      await updateNodes(coreSequelize, nodeIds, urls);
      logger.info(`Updated ${rows.length} code directories.`);
    } else {
      logger.info(
        `Would update ${rows.length} nodes, sample: ${nodeIds.slice(0, 5).join(", ")}, ${urls.slice(0, 5).join(", ")}`
      );
    }
  } while (updatedRowsCount === BATCH_SIZE);
}

async function backfillAllCodeFiles(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing files");

  let nextId = 0;
  let updatedRowsCount;
  do {
    const rows: { id: number; documentId: string; sourceUrl: string }[] =
      await connectorsSequelize.query(
        `
          SELECT gcf.id, gcf."documentId", gcf."sourceUrl"
          FROM github_code_files gcf
          WHERE gcf.id > :nextId
          ORDER BY gcf.id
          LIMIT :batchSize;`,
        {
          replacements: {
            batchSize: BATCH_SIZE,
            nextId,
          },
          type: QueryTypes.SELECT,
        }
      );

    if (rows.length == 0) {
      logger.info({ nextId }, `Finished processing files.`);
      break;
    }
    nextId = rows[rows.length - 1].id;
    updatedRowsCount = rows.length;

    const urls = rows.map((row) => row.sourceUrl);
    const nodeIds = rows.map((row) => {
      return row.documentId;
    });
    if (execute) {
      await updateNodes(coreSequelize, nodeIds, urls);
      logger.info(`Updated ${rows.length} code files.`);
    } else {
      logger.info(
        `Would update ${rows.length} nodes, sample: ${nodeIds.slice(0, 5).join(", ")}, ${urls.slice(0, 5).join(", ")}`
      );
    }
  } while (updatedRowsCount === BATCH_SIZE);
}

async function backfillAllMetaNodes(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
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
          ORDER BY gcr.id
          LIMIT :batchSize;`,
        {
          replacements: {
            batchSize: BATCH_SIZE,
            nextId,
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
      await updateNodes(coreSequelize, repoNodeIds, repoUrls);
      await updateNodes(coreSequelize, discussionNodeIds, discussionUrls);
      await updateNodes(coreSequelize, issuesNodeIds, issuesUrls);
      await updateNodes(coreSequelize, codeRootNodeIds, codeRootUrls);
      logger.info(`Updated ${rows.length} repo nodes.`);
    } else {
      logger.info(
        `Would update ${rows.length * 4} meta nodes, sample for repo: ${repoNodeIds.slice(0, 5).join(", ")}, ${repoUrls.slice(0, 5).join(", ")}`
      );
    }
  } while (updatedRowsCount === BATCH_SIZE);
}

async function backfillAllIssuesAndDiscussions(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
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
          ORDER BY gcr.id
          LIMIT :batchSize;`,
        {
          replacements: {
            batchSize: BATCH_SIZE,
            nextId,
          },
          type: QueryTypes.SELECT,
        }
      );

    if (rows.length == 0) {
      logger.info({ nextId }, `Finished processing issues and discussions.`);
      break;
    }
    nextId = rows[rows.length - 1].id;
    updatedRowsCount = rows.length;

    for (const repo of rows) {
      await backfillIssuesForRepo(
        coreSequelize,
        connectorsSequelize,
        repo.repoId,
        repo.sourceUrl,
        execute,
        logger
      );
      await backfillDiscussionsForRepo(
        coreSequelize,
        connectorsSequelize,
        repo.repoId,
        repo.sourceUrl,
        execute,
        logger
      );
    }
  } while (updatedRowsCount === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();

  await backfillAllMetaNodes(
    coreSequelize,
    connectorsSequelize,
    execute,
    logger
  );
  await backfillAllCodeDirs(
    coreSequelize,
    connectorsSequelize,
    execute,
    logger
  );
  await backfillAllCodeFiles(
    coreSequelize,
    connectorsSequelize,
    execute,
    logger
  );

  await backfillAllIssuesAndDiscussions(
    coreSequelize,
    connectorsSequelize,
    execute,
    logger
  );
});
