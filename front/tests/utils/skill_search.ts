import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";

// Apply the query's filters in ES mocks. Text matching and ranking are tested separately.
export function matchesSkillSearchFilters(
  document: SkillSearchDocument,
  query: estypes.QueryDslQueryContainer
): boolean {
  const values = (field: string) => [document[field]].flat();
  if (query.exists) {
    return values(query.exists.field).some((value) => value != null);
  }
  if (query.bool) {
    const { filter = [], must = [], must_not = [], should = [] } = query.bool;
    const matches = (clause: estypes.QueryDslQueryContainer) =>
      matchesSkillSearchFilters(document, clause);
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
  assert(
    query.match_all ||
      query.multi_match ||
      query.dis_max ||
      query.constant_score,
    "Unsupported skill search filter"
  );
  return true;
}
