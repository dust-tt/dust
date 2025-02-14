import type { LoggerInterface } from "@dust-tt/client";

export const CUSTOM_TAG_LIMITS = {
  MAX_COUNT: 32,
  MAX_LENGTH: 64,
} as const;

export function filterCustomTags(
  tags: string[],
  logger: LoggerInterface
): string[] {
  let filteredTags = tags.filter((tag) => {
    if (tag.length > CUSTOM_TAG_LIMITS.MAX_LENGTH) {
      logger.warn({ tag }, "Tag length exceeds maximum limit, ignored.");
      return false;
    }
    return true;
  });

  if (filteredTags.length > CUSTOM_TAG_LIMITS.MAX_COUNT) {
    logger.warn(
      { tags, filteredTags },
      "Number of custom tags exceeds maximum limit, truncated."
    );
    filteredTags = filteredTags.slice(0, CUSTOM_TAG_LIMITS.MAX_COUNT);
  }

  return filteredTags;
}
