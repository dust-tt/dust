import type { ModelId } from "@dust-tt/types";
import { Client, isFullDatabase, isFullPage } from "@notionhq/client";
import { Op } from "sequelize";

import { getNotionAccessToken } from "@connectors/connectors/notion/temporal/activities";
import { NotionDatabase } from "@connectors/lib/models/notion";
import mainLogger from "@connectors/logger/logger";

import { getParsedDatabase, retrievePage } from "./notion_api";

const logger = mainLogger.child({ provider: "notion" });

async function listSkippedDatabaseIdsForConnectorId(connectorId: ModelId) {
  const skippedDatabases = await NotionDatabase.findAll({
    where: {
      connectorId: connectorId,
      skipReason: {
        [Op.not]: null,
      },
    },
  });

  return new Set(skippedDatabases.map((db) => db.notionDatabaseId));
}

export async function searchNotionPagesForQuery({
  connectorId,
  connectionId,
  query,
}: {
  connectorId: ModelId;
  connectionId: string;
  query: string;
}) {
  const notionAccessToken = await getNotionAccessToken(connectionId);

  const notionClient = new Client({
    auth: notionAccessToken,
  });

  const pages = await notionClient.search({
    query,
    page_size: 20,
  });

  const skippedDatabaseIds = await listSkippedDatabaseIdsForConnectorId(
    connectorId
  );

  return pages.results.map((p) => ({
    id: p.id,
    type: p.object,
    title: "title" in p ? p.title[0]?.plain_text : "<unknown>",
    isSkipped: p.object === "database" && skippedDatabaseIds.has(p.id),
    isFull: p.object === "database" ? isFullDatabase(p) : isFullPage(p),
  }));
}

export async function checkNotionUrl({
  connectorId,
  connectionId,
  url,
}: {
  connectorId: ModelId;
  connectionId: string;
  url: string;
}) {
  const notionAccessToken = await getNotionAccessToken(connectionId);

  // parse URL
  const u = new URL(url);
  const last = u.pathname.split("/").pop();
  if (!last) {
    throw new Error(`Unhandled URL (could not get "last"): ${url}`);
  }
  const id = last.split("-").pop();
  if (!id || id.length !== 32) {
    throw new Error(`Unhandled URL (could not get 32 char ID): ${url}`);
  }

  const pageOrDbId =
    id.slice(0, 8) +
    "-" +
    id.slice(8, 12) +
    "-" +
    id.slice(12, 16) +
    "-" +
    id.slice(16, 20) +
    "-" +
    id.slice(20);

  const page = await retrievePage({
    accessToken: notionAccessToken,
    pageId: pageOrDbId,
    loggerArgs: { connectorId, connectionId },
  });

  if (page) {
    logger.info({ pageOrDbId, url, page }, "Page found");
    return { page, db: null };
  } else {
    logger.info({ pageOrDbId, url }, "Page not found");
  }

  const db = await getParsedDatabase(notionAccessToken, pageOrDbId, {
    connectorId,
    connectionId,
  });

  if (db) {
    logger.info({ pageOrDbId, url, db }, "Database found");
    return { page: null, db };
  } else {
    logger.info({ pageOrDbId, url }, "Database not found");
  }

  return { page: null, db: null };
}
