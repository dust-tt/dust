// TODO(keyword-search): Until we remove the `managed-` prefix, we need to sanitize the search name.
export function formatDataSourceDisplayName(name: string) {
  return name
    .replace(/[-_]/g, " ") // Replace both hyphens and underscores with spaces.
    .split(" ")
    .filter((part) => part !== "managed")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Edge-ngram starts at 2 characters.
export const MIN_SEARCH_QUERY_SIZE = 2;
