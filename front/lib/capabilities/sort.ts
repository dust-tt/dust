import { compareForFuzzySort } from "@app/lib/utils";

export type CapabilitySortItem = {
  sortName: string;
};

export function getCapabilitySortName(name: string) {
  return name.toLowerCase();
}

export function compareCapabilitiesByName<T extends CapabilitySortItem>(
  a: T,
  b: T
) {
  return a.sortName.localeCompare(b.sortName);
}

export function sortCapabilityMatches<T extends CapabilitySortItem>({
  items,
  normalizedQuery,
}: {
  items: T[];
  normalizedQuery: string;
}): T[] {
  return items.toSorted((a, b) => {
    if (normalizedQuery.length > 0) {
      return (
        compareForFuzzySort(normalizedQuery, a.sortName, b.sortName) ||
        compareCapabilitiesByName(a, b)
      );
    }

    return compareCapabilitiesByName(a, b);
  });
}
