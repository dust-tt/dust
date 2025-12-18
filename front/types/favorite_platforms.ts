import { isInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";

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
