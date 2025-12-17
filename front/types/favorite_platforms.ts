export const FAVORITE_PLATFORM_OPTIONS = [
  { value: "slack", label: "Slack" },
  { value: "notion", label: "Notion" },
  { value: "confluence", label: "Confluence" },
  { value: "github", label: "GitHub" },
  { value: "hubspot", label: "HubSpot" },
  { value: "jira", label: "Jira" },
  { value: "front", label: "Front" },
  { value: "google", label: "Google" },
  { value: "microsoft", label: "Microsoft" },
] as const;

export type FavoritePlatform =
  (typeof FAVORITE_PLATFORM_OPTIONS)[number]["value"];

export function isFavoritePlatform(value: string): value is FavoritePlatform {
  return FAVORITE_PLATFORM_OPTIONS.some((option) => option.value === value);
}
