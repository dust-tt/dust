import { NOTION_TAG_LIMITS } from "@connectors/connectors/notion/lib/constants";
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
    // Handle custom __dust prefixed properties
    if (property.key.startsWith("__dust") && property.value?.length) {
      if (!Array.isArray(property.value)) {
        const tag = `${property.key}:${property.value}`;
        if (tag.length <= NOTION_TAG_LIMITS.MAX_TAG_LENGTH) {
          customTags.push(tag);
        }
      } else {
        for (const v of property.value) {
          const tag = `${property.key}:${v}`;
          if (tag.length <= NOTION_TAG_LIMITS.MAX_TAG_LENGTH) {
            customTags.push(tag);
          }
        }
      }
    }

    // Handle Tags property values
    if (property.key.toLowerCase() === "tags" && property.value?.length) {
      if (!Array.isArray(property.value)) {
        if (property.value.length <= NOTION_TAG_LIMITS.MAX_TAG_LENGTH) {
          customTags.push(property.value);
        }
      } else {
        for (const v of property.value) {
          if (v.length <= NOTION_TAG_LIMITS.MAX_TAG_LENGTH) {
            customTags.push(v);
          }
        }
      }
    }
  }

  // System tags should always be included, custom tags are limited
  const systemTags = [
    `author:${author}`,
    `lastEditor:${lastEditor}`,
    `createdAt:${createdTime}`,
    `updatedAt:${updatedTime}`,
  ];

  return tags
    .concat(systemTags)
    .concat(customTags.slice(0, NOTION_TAG_LIMITS.MAX_CUSTOM_TAGS_COUNT));
}
