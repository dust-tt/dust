import { ParsedNotionPage } from "@connectors/connectors/notion/lib/types";

export function getTagsForPage(page: ParsedNotionPage): string[] {
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
