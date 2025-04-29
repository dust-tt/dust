import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";
import type { ModelId } from "@connectors/types";

export async function getAllOrphanedResources({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<{
  pageIds: string[];
  databaseIds: string[];
}> {
  const pages = await NotionPage.findAll({
    where: {
      connectorId,
      parentType: "unknown",
    },
    attributes: ["notionPageId"],
  });
  const databases = await NotionDatabase.findAll({
    where: {
      connectorId,
      parentType: "unknown",
    },
    attributes: ["notionDatabaseId"],
  });

  return {
    pageIds: pages.map((page) => page.notionPageId),
    databaseIds: databases.map((db) => db.notionDatabaseId),
  };
}
