import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

import {
  getConnectorsReplicaDbConnection,
  getCorePrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types";

const BATCH_SIZE = 1024;

// Copy-pasted from zendesk/lib/id_conversions.ts
function getBrandInternalId({
  connectorId,
  brandId,
}: {
  connectorId: ModelId;
  brandId: number;
}): string {
  return `zendesk-brand-${connectorId}-${brandId}`;
}

// Copy-pasted from zendesk/lib/id_conversions.ts
function getCategoryInternalId({
  connectorId,
  brandId,
  categoryId,
}: {
  connectorId: ModelId;
  brandId: number;
  categoryId: number;
}): string {
  return `zendesk-category-${connectorId}-${brandId}-${categoryId}`;
}

// Copy-pasted from zendesk/lib/id_conversions.ts
function getArticleInternalId({
  connectorId,
  brandId,
  articleId,
}: {
  connectorId: ModelId;
  brandId: number;
  articleId: number;
}): string {
  return `zendesk-article-${connectorId}-${brandId}-${articleId}`;
}

// Copy-pasted from zendesk/lib/id_conversions.ts
function getTicketInternalId({
  connectorId,
  brandId,
  ticketId,
}: {
  connectorId: ModelId;
  brandId: number;
  ticketId: number;
}): string {
  return `zendesk-ticket-${connectorId}-${brandId}-${ticketId}`;
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

async function backfillBrands(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing brands");

  // processing the brands all at once (~50 brands at time of writing)
  const rows: { brandId: number; url: string; connectorId: number }[] =
    await connectorsSequelize.query(
      `SELECT "brandId", "url", "connectorId"
       FROM zendesk_brands;`,
      { type: QueryTypes.SELECT }
    );

  const urls = rows.map((row) => row.url);
  const nodeIds = rows.map((row) => {
    const { brandId, connectorId } = row;
    return getBrandInternalId({ connectorId, brandId });
  });
  if (execute) {
    await updateNodes(coreSequelize, nodeIds, urls);
    logger.info(`Updated ${rows.length} brands.`);
  } else {
    logger.info(
      `Would update ${rows.length} nodes, sample: ${nodeIds.slice(0, 5).join(", ")}, ${urls.slice(0, 5).join(", ")}`
    );
  }
}

async function backfillCategories(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing categories");

  // processing the categories all at once (~200 categories at time of writing)
  const rows: {
    categoryId: number;
    brandId: number;
    url: string;
    connectorId: number;
  }[] = await connectorsSequelize.query(
    `SELECT "categoryId", "brandId", "url", "connectorId"
     FROM zendesk_categories;`,
    { type: QueryTypes.SELECT }
  );

  const urls = rows.map((row) => row.url);
  const nodeIds = rows.map((row) => {
    const { categoryId, brandId, connectorId } = row;
    return getCategoryInternalId({ connectorId, brandId, categoryId });
  });
  if (execute) {
    await updateNodes(coreSequelize, nodeIds, urls);
    logger.info(`Updated ${rows.length} categories.`);
  } else {
    logger.info(
      `Would update ${rows.length} nodes, sample: ${nodeIds.slice(0, 5).join(", ")}, ${urls.slice(0, 5).join(", ")}`
    );
  }
}

async function backfillArticles(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing articles");

  // processing the articles chunk by chunk (~8k articles at time of writing)
  let lastId = 0;
  let rows: {
    id: number;
    articleId: number;
    brandId: number;
    url: string;
    connectorId: number;
  }[] = [];

  do {
    rows = await connectorsSequelize.query(
      `SELECT id, "articleId", "brandId", "url", "connectorId"
       FROM zendesk_articles
       WHERE id > :lastId
       ORDER BY id
       LIMIT :batchSize;`,
      {
        replacements: { batchSize: BATCH_SIZE, lastId },
        type: QueryTypes.SELECT,
      }
    );

    const urls = rows.map((row) => row.url);
    const nodeIds = rows.map((row) => {
      const { articleId, brandId, connectorId } = row;
      return getArticleInternalId({ connectorId, brandId, articleId });
    });

    if (rows.length === 0) {
      break;
    }

    if (execute) {
      await updateNodes(coreSequelize, nodeIds, urls);
      logger.info(
        `Updated ${rows.length} articles from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    } else {
      logger.info(
        `Would update ${rows.length} articles from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    }

    lastId = rows[rows.length - 1].id;
  } while (rows.length === BATCH_SIZE);
}

async function backfillTickets(
  coreSequelize: Sequelize,
  connectorsSequelize: Sequelize,
  execute: boolean,
  logger: typeof Logger
) {
  logger.info("Processing tickets");

  // processing the tickets chunk by chunk (>1.5M tickets at time of writing)
  let lastId = 0;
  let rows: {
    id: number;
    ticketId: number;
    brandId: number;
    url: string;
    connectorId: number;
  }[] = [];

  do {
    rows = await connectorsSequelize.query(
      `SELECT id, "ticketId", "brandId", "url", "connectorId"
       FROM zendesk_tickets
       WHERE id > :lastId
       ORDER BY id
       LIMIT :batchSize;`,
      {
        replacements: { batchSize: BATCH_SIZE, lastId },
        type: QueryTypes.SELECT,
      }
    );

    const urls = rows.map((row) => row.url);
    const nodeIds = rows.map((row) => {
      const { ticketId, brandId, connectorId } = row;
      return getTicketInternalId({ connectorId, brandId, ticketId });
    });

    if (rows.length === 0) {
      break;
    }

    if (execute) {
      await updateNodes(coreSequelize, nodeIds, urls);
      logger.info(
        `Updated ${rows.length} tickets from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    } else {
      logger.info(
        `Would update ${rows.length} tickets from id ${rows[0].id} to id ${rows[rows.length - 1].id}.`
      );
    }

    lastId = rows[rows.length - 1].id;
  } while (rows.length === BATCH_SIZE);
}

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();
  const connectorsSequelize = getConnectorsReplicaDbConnection();

  await backfillBrands(coreSequelize, connectorsSequelize, execute, logger);
  await backfillCategories(coreSequelize, connectorsSequelize, execute, logger);
  await backfillArticles(coreSequelize, connectorsSequelize, execute, logger);
  await backfillTickets(coreSequelize, connectorsSequelize, execute, logger);
});
