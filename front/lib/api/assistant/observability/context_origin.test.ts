import { contextOriginFilter } from "@app/lib/api/assistant/observability/context_origin";
import { describe, expect, it } from "vitest";

describe("contextOriginFilter", () => {
  it("returns no clause for undefined / empty array / empty string", () => {
    expect(contextOriginFilter(undefined)).toEqual([]);
    expect(contextOriginFilter([])).toEqual([]);
    expect(contextOriginFilter("")).toEqual([]);
  });

  it("emits a term query for a single known origin", () => {
    expect(contextOriginFilter("slack")).toEqual([
      { term: { context_origin: "slack" } },
    ]);
  });

  it("emits a terms query for multiple known origins", () => {
    expect(contextOriginFilter(["slack", "web"])).toEqual([
      { terms: { context_origin: ["slack", "web"] } },
    ]);
  });

  it("matches the literal value OR a missing field for the unknown sentinel", () => {
    expect(contextOriginFilter("unknown")).toEqual([
      {
        bool: {
          should: [
            { term: { context_origin: "unknown" } },
            { bool: { must_not: { exists: { field: "context_origin" } } } },
          ],
          minimum_should_match: 1,
        },
      },
    ]);
  });

  it("matches all values literally and ORs the missing-field clause when unknown is included", () => {
    expect(contextOriginFilter(["slack", "unknown"])).toEqual([
      {
        bool: {
          should: [
            { terms: { context_origin: ["slack", "unknown"] } },
            { bool: { must_not: { exists: { field: "context_origin" } } } },
          ],
          minimum_should_match: 1,
        },
      },
    ]);
  });

  it("drops empty values before building clauses", () => {
    expect(contextOriginFilter(["slack", ""])).toEqual([
      { term: { context_origin: "slack" } },
    ]);
  });
});
