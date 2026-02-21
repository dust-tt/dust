import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import { slugify } from "@app/types/shared/utils/string_utils";

const MAX_TOOL_NAME_LENGTH = 64;

export function getPrefixedToolName(
  serverName: string,
  originalName: string
): string {
  // Slugify each part separately to preserve separators (used for space disambiguation notably).
  const slugifiedConfigName = serverName
    .split(TOOL_NAME_SEPARATOR)
    .map(slugify)
    .join(TOOL_NAME_SEPARATOR);
  const slugifiedOriginalName = slugify(originalName).replaceAll(
    // Remove anything that is not a-zA-Z0-9_.- because it's not supported by the LLMs.
    /[^a-zA-Z0-9_.-]/g,
    ""
  );

  const separator = TOOL_NAME_SEPARATOR;

  // If the original name is already too long, we can't use it.
  if (slugifiedOriginalName.length > MAX_TOOL_NAME_LENGTH) {
    throw new Error(
      `Tool name "${originalName}" is too long. Maximum length is ${MAX_TOOL_NAME_LENGTH} characters.`
    );
  }

  // Calculate if we have enough room for a meaningful prefix (3 chars) plus separator
  const minPrefixLength = 3 + separator.length;
  const availableSpace = MAX_TOOL_NAME_LENGTH - slugifiedOriginalName.length;

  // If we don't have enough room for a meaningful prefix, just return the original name
  if (availableSpace < minPrefixLength) {
    return slugifiedOriginalName;
  }

  // Calculate the maximum allowed length for the config name portion
  const maxConfigNameLength = availableSpace - separator.length;
  const truncatedConfigName = slugifiedConfigName.slice(0, maxConfigNameLength);
  const prefixedName = `${truncatedConfigName}${separator}${slugifiedOriginalName}`;

  return prefixedName;
}
