import type { AgentSearchDocument } from "@app/types/agent_search/agent_search";
import { isNumber, isRecord } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";

function isFieldContainer(value: unknown): value is Record<string, unknown> {
  return value instanceof Object && isRecord(value);
}

// Apply the query's filters in ES mocks. Text matching and ranking are tested separately.
export function matchesAgentSearchFilters(
  document: AgentSearchDocument,
  query: estypes.QueryDslQueryContainer
): boolean {
  const values = (field: string): unknown[] => {
    let value: unknown = document;
    for (const key of field.split(".")) {
      if (value === null) {
        return [];
      }
      assert(isFieldContainer(value), `Unknown agent search field: ${field}`);
      const entry = Object.entries(value).find(([name]) => name === key);
      assert(entry, `Unknown agent search field: ${field}`);
      value = entry[1];
    }
    return [value].flat();
  };
  if (query.bool) {
    const { filter = [], must = [], must_not = [], should = [] } = query.bool;
    const matches = (clause: estypes.QueryDslQueryContainer) =>
      matchesAgentSearchFilters(document, clause);
    const minimum =
      query.bool.minimum_should_match ??
      ([should].flat().length > 0 && !query.bool.filter && !query.bool.must
        ? 1
        : 0);
    return (
      [filter, must].flat().every(matches) &&
      ![must_not].flat().some(matches) &&
      [should].flat().filter(matches).length >= Number(minimum)
    );
  }
  if (query.term) {
    return Object.entries(query.term).every(([field, value]) =>
      values(field).includes(value)
    );
  }
  if (query.terms) {
    return Object.entries(query.terms).every(([field, terms]) => {
      assert(Array.isArray(terms));
      return values(field).some((value) => terms.includes(value));
    });
  }
  if (query.terms_set) {
    return Object.entries(query.terms_set).every(([field, terms]) => {
      assert(terms);
      assert.deepStrictEqual(terms.minimum_should_match_script, {
        source: `doc['${field}'].size()`,
      });
      const required = values(field);
      return (
        required.length > 0 &&
        required.every((value) => terms.terms.includes(String(value)))
      );
    });
  }
  if (query.range) {
    return Object.entries(query.range).every(([field, bounds]) => {
      assert(bounds && "gte" in bounds);
      const { gte, lte } = bounds;
      return values(field).some(
        (value) =>
          isNumber(value) &&
          (gte === undefined || value >= Number(gte)) &&
          (lte === undefined || value <= Number(lte))
      );
    });
  }
  if (query.exists) {
    return values(query.exists.field).some(
      (value) => value !== null && value !== undefined
    );
  }
  if (query.match_none) {
    return false;
  }
  assert(
    query.match_all || query.multi_match,
    "Unsupported agent search filter"
  );
  return true;
}
