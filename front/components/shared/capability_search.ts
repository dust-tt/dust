import { compareForFuzzySort, subFilter } from "@app/lib/utils";

export function normalizeCapabilitySearchQuery(query: string) {
  return query.trim().toLowerCase();
}

export function matchesCapabilitySearchQuery({
  label,
  normalizedQuery,
}: {
  label: string;
  normalizedQuery: string;
}) {
  if (normalizedQuery.length === 0) {
    return true;
  }

  return subFilter(normalizedQuery, label.toLowerCase());
}

export function compareCapabilitySearchResults({
  normalizedQuery,
  a,
  b,
}: {
  normalizedQuery: string;
  a: string;
  b: string;
}) {
  if (normalizedQuery.length > 0) {
    return compareForFuzzySort(normalizedQuery, a, b) || a.localeCompare(b);
  }

  return a.localeCompare(b);
}
