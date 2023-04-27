import type { ParsedPage } from "@connectors/connectors/notion/lib/notion_api";

export function getTagsForPage(page: ParsedPage): string[] {
  const tags: string[] = [];
  const titleProperty = page.properties.find((p) => p.type === "title")?.text;
  if (titleProperty) {
    tags.push(`title:${titleProperty}`);
  }

  return tags.concat([
    `lastEditedAt:${page.updatedTime}`,
    `author:${page.author}`,
    `lastEditor:${page.lastEditor}`,
  ]);
}
