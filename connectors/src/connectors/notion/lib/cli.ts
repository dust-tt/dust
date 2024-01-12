import { Client } from "@notionhq/client";

import { getNotionAccessToken } from "@connectors/connectors/notion/temporal/activities";

export async function searchNotionPagesForQuery(
  connectionId: string,
  query: string
) {
  const notionAccessToken = await getNotionAccessToken(connectionId);

  const notionClient = new Client({
    auth: notionAccessToken,
  });

  const pages = await notionClient.search({
    query,
    page_size: 20,
  });

  return pages.results.map((p) => ({
    id: p.id,
    type: p.object,
    title: "title" in p ? p.title[0]?.plain_text : "<unknown>",
  }));
}
