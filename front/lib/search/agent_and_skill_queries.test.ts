import { buildDiscoverSearchQuery } from "@app/lib/search/agent_and_skill_queries";
import { describe, expect, it } from "vitest";

describe("buildDiscoverSearchQuery", () => {
  it("matches everything for an empty query, ranked by usage", () => {
    expect(buildDiscoverSearchQuery("   ")).toMatchObject({
      function_score: {
        query: { match_all: {} },
        boost_mode: "sum",
        functions: [
          {
            field_value_factor: {
              field: "active_users_count",
              modifier: "log1p",
            },
          },
        ],
      },
    });
  });

  it("requires most terms, with fuzzy clauses on the language sub-fields", () => {
    const query = buildDiscoverSearchQuery("Meetings recap");
    expect(query).toMatchObject({
      function_score: {
        query: {
          bool: {
            should: [expect.anything(), expect.anything()],
            minimum_should_match: "75%",
          },
        },
      },
    });

    const serialized = JSON.stringify(query);
    expect(serialized).toContain('"fuzziness":"AUTO"');
    expect(serialized).toContain('"name.english"');
    expect(serialized).toContain('"description.english"');
    expect(serialized).toContain('"name.french"');
    expect(serialized).toContain('"description.french"');
  });
});
