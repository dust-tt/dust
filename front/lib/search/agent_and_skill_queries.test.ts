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

  it("requires every term of a short query, fuzzy on names only", () => {
    expect(buildDiscoverSearchQuery("Meetings recap")).toMatchObject({
      function_score: {
        query: {
          bool: {
            should: [
              {
                dis_max: {
                  queries: [
                    {
                      constant_score: {
                        filter: {
                          multi_match: {
                            query: "Meetings",
                            type: "bool_prefix",
                          },
                        },
                        boost: 3,
                      },
                    },
                    {
                      constant_score: {
                        filter: {
                          multi_match: {
                            query: "Meetings",
                            fields: expect.arrayContaining([
                              "name.english",
                              "name.french",
                            ]),
                            fuzziness: "AUTO",
                          },
                        },
                        boost: 2,
                      },
                    },
                    {
                      constant_score: {
                        filter: {
                          multi_match: {
                            query: "Meetings",
                            fields: [
                              "description.english",
                              "description.french",
                            ],
                          },
                        },
                        boost: 1,
                      },
                    },
                  ],
                },
              },
              expect.anything(),
            ],
            minimum_should_match: "2<75%",
          },
        },
      },
    });
  });

  it("does not use fuzziness on descriptions", () => {
    const query = buildDiscoverSearchQuery("report");
    expect(query).toMatchObject({
      function_score: {
        query: {
          bool: {
            should: [
              {
                dis_max: {
                  queries: [
                    expect.anything(),
                    expect.anything(),
                    {
                      constant_score: {
                        filter: {
                          multi_match: expect.not.objectContaining({
                            fuzziness: expect.anything(),
                          }),
                        },
                      },
                    },
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
