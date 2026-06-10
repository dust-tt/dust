import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { slugify } from "@app/types/shared/utils/string_utils";

const MAX_TOOL_NAME_LENGTH = 64;

export function tryGetPrefixedToolName(
  serverName: string,
  originalName: string
): Result<string, Error> {
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
    return new Err(
      new Error(
        `Tool name "${originalName}" is too long. Maximum length is ${MAX_TOOL_NAME_LENGTH} characters.`
      )
    );
  }

  // Calculate if we have enough room for a meaningful prefix (3 chars) plus separator
  const minPrefixLength = 3 + separator.length;
  const availableSpace = MAX_TOOL_NAME_LENGTH - slugifiedOriginalName.length;

  // If we don't have enough room for a meaningful prefix, just return the original name
  if (availableSpace < minPrefixLength) {
    return new Ok(slugifiedOriginalName);
  }

  // Calculate the maximum allowed length for the config name portion
  const maxConfigNameLength = availableSpace - separator.length;
  const truncatedConfigName = slugifiedConfigName.slice(0, maxConfigNameLength);
  const prefixedName = `${truncatedConfigName}${separator}${slugifiedOriginalName}`;

  return new Ok(prefixedName);
}

// Throwing variant for call sites passing compile-time constant names (e.g.
// tool references embedded in prompts), where a failure is a programming
// error. Dynamic or user-provided names must use `tryGetPrefixedToolName`.
export function getPrefixedToolName(
  serverName: string,
  originalName: string
): string {
  const result = tryGetPrefixedToolName(serverName, originalName);
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}
