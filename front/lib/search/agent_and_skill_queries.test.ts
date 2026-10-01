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

  it("requires most terms, with fuzzy and synonym clauses per term", () => {
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
    expect(serialized).toContain("call sync standup notes");
    expect(serialized).toContain("summarize summary digest tldr brief");
  });

  it("skips synonym clauses for a term outside the dictionary", () => {
    expect(buildDiscoverSearchQuery("zorglub")).toMatchObject({
      function_score: {
        query: {
          bool: {
            should: [
              {
                dis_max: {
                  queries: [
                    expect.anything(),
                    expect.anything(),
                    expect.anything(),
                  ],
                },
              },
            ],
          },
        },
      },
    });
  });
});
