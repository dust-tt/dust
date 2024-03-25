import type { parsePageProperties } from "@connectors/connectors/notion/lib/notion_api";

export function getTagsForPage({
  title,
  author,
  lastEditor,
  updatedTime,
  createdTime,
  parsedProperties,
}: {
  title?: string | null;
  author: string;
  lastEditor: string;
  updatedTime: number;
  createdTime: number;
  parsedProperties: ReturnType<typeof parsePageProperties>;
}): string[] {
  const tags: string[] = [];
  if (title) {
    tags.push(`title:${title}`);
  }

  const customTags = [];
  for (const property of parsedProperties) {
    if (property.key.startsWith("__dust") && property.value?.length) {
      if (!Array.isArray(property.value)) {
        customTags.push(`${property.key}:${property.value}`);
      } else {
        for (const v of property.value) {
          customTags.push(`${property.key}:${v}`);
        }
      }
    }
  }

  return tags
    .concat([
      `author:${author}`,
      `lastEditor:${lastEditor}`,
      `createdAt:${createdTime}`,
      `updatedAt:${updatedTime}`,
    ])
    .concat(customTags);
}
