import type { LoggerInterface } from "@dust-tt/client";

import type { parsePageProperties } from "@connectors/connectors/notion/lib/notion_api";
import { filterCustomTags } from "@connectors/connectors/shared/tags";

export function getTagsForPage({
  title,
  author,
  lastEditor,
  updatedTime,
  createdTime,
  parsedProperties,
  logger,
}: {
  title?: string | null;
  author: string;
  lastEditor: string;
  updatedTime: number;
  createdTime: number;
  parsedProperties: ReturnType<typeof parsePageProperties>;
  logger: LoggerInterface;
}): string[] {
  const tags: string[] = [];
  if (title) {
    tags.push(`title:${title}`);
  }

  const customTags = [];
  for (const property of parsedProperties) {
    if (property.type === "multi_select") {
      if (property.value?.length) {
        if (!Array.isArray(property.value)) {
          customTags.push(`${property.key}:${property.value}`);
        } else {
          for (const v of property.value) {
            customTags.push(`${property.key}:${v}`);
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

  return tags.concat(systemTags).concat(filterCustomTags(customTags, logger));
}
