import type { ParsedPage } from "@connectors/connectors/notion/lib/notion_api";

export function getTagsForPage(page: ParsedPage): string[] {
  const tags: string[] = [];
  if (page.title) {
    tags.push(`title:${page.title}`);
  }

  return tags.concat([
    `author:${page.author}`,
    `lastEditor:${page.lastEditor}`,
    `lastEditedAt:${page.updatedTime}`,
    `createdAt:${page.createdTime}`,
  ]);
}
