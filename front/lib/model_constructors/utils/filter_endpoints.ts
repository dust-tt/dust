import type { BaseModelConfiguration } from "@app/lib/model_constructors/configuration";
import type { Filter } from "@app/lib/model_constructors/types/filter";
import { matchFilter } from "@app/lib/model_constructors/utils/match_filter";

// Filters endpoints against `filter`, then orders the matches by region,
// following the order of `filter.regions`: all endpoints in `regions[0]` come
// first, then those in `regions[1]`, etc. Within a region the original input
// order is preserved (stable sort). Generic over the inference surface (stream /
// batch) since both share `BaseModelConfiguration`.
export function getFilteredEndpoints<T extends BaseModelConfiguration>(
  endpoints: T[],
  filter: Filter
): T[] {
  const matched = endpoints.filter((model) => matchFilter(model, filter));

  const { regions } = filter;
  if (regions === undefined || regions.length === 0) {
    return matched;
  }

  return [...matched].sort(
    (a, b) => regions.indexOf(a.region) - regions.indexOf(b.region)
  );
}
