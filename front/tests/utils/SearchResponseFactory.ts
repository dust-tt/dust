import type { estypes } from "@elastic/elasticsearch";

export function makeSearchResponse<TDocument, TAggregations = unknown>(
  overrides: Partial<estypes.SearchResponse<TDocument, TAggregations>> = {}
): estypes.SearchResponse<TDocument, TAggregations> {
  return {
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: { total: { value: 0, relation: "eq" }, hits: [] },
    ...overrides,
  };
}
