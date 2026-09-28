import { isInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import { isStringArray } from "@app/types/shared/utils/general";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";

// Subset of InternalMCPServerNameType that users can select as favorites during onboarding.
export const FAVORITE_PLATFORM_OPTIONS = [
  "slack",
  "notion",
  "confluence",
  "github",
  "hubspot",
  "jira",
  "front",
  "gmail",
  "outlook",
] as const;

export type FavoritePlatform = (typeof FAVORITE_PLATFORM_OPTIONS)[number];

export function isFavoritePlatform(value: string): value is FavoritePlatform {
  return (
    isInternalMCPServerName(value) &&
    (FAVORITE_PLATFORM_OPTIONS as readonly string[]).includes(value)
  );
}

/**
 * @cc [owner:adrsimon,label:product] unreadable-favorites-are-empty
 * A missing value, invalid JSON, or a list holding any unknown platform MUST parse to `[]`.
 */
export function parseFavoritePlatforms(
  value: string | undefined
): FavoritePlatform[] {
  if (!value) {
    return [];
  }

  const parsed = safeParseJSON(value);
  if (
    parsed.isOk() &&
    isStringArray(parsed.value) &&
    parsed.value.every(isFavoritePlatform)
  ) {
    return parsed.value;
  }

  return [];
}
