import type { ModelId } from "@dust-tt/types";
import { Client, isFullDatabase, isFullPage } from "@notionhq/client";
import { Op } from "sequelize";

import { getNotionAccessToken } from "@connectors/connectors/notion/temporal/activities";
import { NotionDatabase } from "@connectors/lib/models/notion";

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
