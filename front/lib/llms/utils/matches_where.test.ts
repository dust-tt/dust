import type {
  EndpointConfig,
  Where,
  WorkspaceConfig,
} from "@app/lib/llms/types/filter";
import { matchesWhere } from "@app/lib/llms/utils/matches_where";
import { describe, expect, it } from "vitest";

const enterpriseWorkspace: WorkspaceConfig = {
  featureFlags: [
    "use_vertex_for_supported_models",
    "anthropic_vertex_fallback",
  ],
  isEnterprise: true,
  isCreditPriced: false,
};

// A representative non-enterprise workspace with no flags.
const freeWorkspace: WorkspaceConfig = {
  featureFlags: [],
  isEnterprise: false,
  isCreditPriced: false,
};

describe("matchesWhere", () => {
  describe("empty and no-op filters", () => {
    it("matches everything with an empty where", () => {
      expect(matchesWhere(enterpriseWorkspace, {})).toBe(true);
      expect(matchesWhere(freeWorkspace, {})).toBe(true);
    });

    it("ignores a field whose filter is not an object (undefined)", () => {
      // `isEnterprise: undefined` is a no-op, not a falsy match.
      const where: Where<WorkspaceConfig> = { isEnterprise: undefined };
      expect(matchesWhere(enterpriseWorkspace, where)).toBe(true);
      expect(matchesWhere(freeWorkspace, where)).toBe(true);
    });
  });

  describe("scalar filters (enterprise)", () => {
    it("eq matches the enterprise boolean", () => {
      expect(
        matchesWhere(enterpriseWorkspace, { isEnterprise: { eq: true } })
      ).toBe(true);
      expect(
        matchesWhere(enterpriseWorkspace, { isEnterprise: { eq: false } })
      ).toBe(false);
      expect(matchesWhere(freeWorkspace, { isEnterprise: { eq: false } })).toBe(
        true
      );
    });

    it("in matches when the value is included", () => {
      expect(
        matchesWhere(enterpriseWorkspace, { isEnterprise: { in: [true] } })
      ).toBe(true);
      expect(
        matchesWhere(freeWorkspace, { isEnterprise: { in: [true] } })
      ).toBe(false);
      // `isEnterprise: true` is not in `[false]`, so this excludes it.
      expect(
        matchesWhere(enterpriseWorkspace, { isEnterprise: { in: [false] } })
      ).toBe(false);
    });

    it("combines multiple scalar conditions (all must pass)", () => {
      // Combining eq/in is only meaningful on a non-boolean field, since
      // `ValueFilter<boolean>` distributes into `ScalarValueFilter<true> |
      // ScalarValueFilter<false>` and cannot mix the two literals.
      const item = { providerId: "anthropic" };
      expect(
        matchesWhere(item, {
          providerId: {
            eq: "anthropic",
            in: ["anthropic", "google_ai_studio"],
          },
        })
      ).toBe(true);
      expect(
        matchesWhere(item, {
          providerId: { eq: "anthropic", in: ["openai"] },
        })
      ).toBe(false);
    });
  });

  describe("scalar filters on endpoint identity fields", () => {
    // Mimics matching an endpoint's singular identity fields, e.g. an Anthropic
    // global Sonnet 4.6 stream endpoint.
    const endpoint = {
      providerId: "anthropic",
      api: "anthropic",
      modelId: "claude-sonnet-4-6",
      region: "global",
    };

    it("eq matches the providerId and region", () => {
      expect(matchesWhere(endpoint, { providerId: { eq: "anthropic" } })).toBe(
        true
      );
      expect(matchesWhere(endpoint, { providerId: { eq: "openai" } })).toBe(
        false
      );
      expect(matchesWhere(endpoint, { region: { eq: "global" } })).toBe(true);
      expect(matchesWhere(endpoint, { region: { eq: "eu" } })).toBe(false);
    });

    it("in matches against an allowed provider list", () => {
      expect(
        matchesWhere(endpoint, {
          providerId: { in: ["anthropic", "openai"] },
        })
      ).toBe(true);
      expect(
        matchesWhere(endpoint, {
          providerId: { in: ["openai", "google_ai_studio"] },
        })
      ).toBe(false);
    });

    it("matches across several identity fields at once", () => {
      expect(
        matchesWhere(endpoint, {
          providerId: { eq: "anthropic" },
          api: { eq: "anthropic" },
          region: { in: ["global", "us"] },
        })
      ).toBe(true);
      expect(
        matchesWhere(endpoint, {
          providerId: { eq: "anthropic" },
          region: { in: ["eu", "us"] },
        })
      ).toBe(false);
    });
  });

  describe("array filters (featureFlags)", () => {
    it("contains matches a single required flag", () => {
      expect(
        matchesWhere(enterpriseWorkspace, {
          featureFlags: { contains: "use_vertex_for_supported_models" },
        })
      ).toBe(true);
      expect(
        matchesWhere(enterpriseWorkspace, {
          featureFlags: { contains: "audit_logs" },
        })
      ).toBe(false);
      expect(
        matchesWhere(freeWorkspace, {
          featureFlags: { contains: "use_vertex_for_supported_models" },
        })
      ).toBe(false);
    });

    it("containsAny matches when at least one flag is present", () => {
      expect(
        matchesWhere(enterpriseWorkspace, {
          featureFlags: {
            containsAny: ["audit_logs", "anthropic_vertex_fallback"],
          },
        })
      ).toBe(true);
      expect(
        matchesWhere(enterpriseWorkspace, {
          featureFlags: { containsAny: ["audit_logs", "deepseek_feature"] },
        })
      ).toBe(false);
    });

    it("containsAll requires every flag to be present", () => {
      expect(
        matchesWhere(enterpriseWorkspace, {
          featureFlags: {
            containsAll: [
              "use_vertex_for_supported_models",
              "anthropic_vertex_fallback",
            ],
          },
        })
      ).toBe(true);
      expect(
        matchesWhere(enterpriseWorkspace, {
          featureFlags: {
            containsAll: ["use_vertex_for_supported_models", "audit_logs"],
          },
        })
      ).toBe(false);
    });

    it("combines multiple array conditions (all must pass)", () => {
      expect(
        matchesWhere(enterpriseWorkspace, {
          featureFlags: {
            contains: "anthropic_vertex_fallback",
            containsAny: ["use_vertex_for_supported_models", "audit_logs"],
          },
        })
      ).toBe(true);
      expect(
        matchesWhere(enterpriseWorkspace, {
          featureFlags: {
            contains: "audit_logs",
            containsAny: ["use_vertex_for_supported_models"],
          },
        })
      ).toBe(false);
    });
  });

  describe("array filters on EndpointConfig lists", () => {
    // Mimics an endpoint description that covers several values per
    // EndpointConfig field: the set of providers / regions / models / apis it
    // exposes. `EndpointConfig` itself is scalar (one value per field on a real
    // endpoint), so the coverage shape arrays each field.
    type EndpointConfigCoverage = {
      [K in keyof EndpointConfig]: EndpointConfig[K][];
    };
    const description: EndpointConfigCoverage = {
      region: ["eu", "global"],
      providerId: ["anthropic"],
      modelId: ["claude-sonnet-4-6"],
      providerApi: ["anthropic", "agent-platform"],
    };

    it("matches provider and region membership", () => {
      expect(
        matchesWhere(description, { providerId: { contains: "anthropic" } })
      ).toBe(true);
      expect(
        matchesWhere(description, { region: { containsAny: ["us", "eu"] } })
      ).toBe(true);
      expect(matchesWhere(description, { region: { contains: "us" } })).toBe(
        false
      );
    });

    it("matches multiple list fields together", () => {
      expect(
        matchesWhere(description, {
          providerId: { contains: "anthropic" },
          providerApi: { containsAll: ["anthropic", "agent-platform"] },
          region: { containsAny: ["eu"] },
        })
      ).toBe(true);
      expect(
        matchesWhere(description, {
          providerId: { contains: "anthropic" },
          providerApi: { contains: "openai-responses" },
        })
      ).toBe(false);
    });
  });

  describe("logical operators", () => {
    it("and requires every child to match", () => {
      expect(
        matchesWhere(enterpriseWorkspace, {
          and: [
            { isEnterprise: { eq: true } },
            { featureFlags: { contains: "anthropic_vertex_fallback" } },
          ],
        })
      ).toBe(true);
      expect(
        matchesWhere(enterpriseWorkspace, {
          and: [
            { isEnterprise: { eq: true } },
            { featureFlags: { contains: "audit_logs" } },
          ],
        })
      ).toBe(false);
    });

    it("an empty `and` array is a no-op (matches)", () => {
      expect(matchesWhere(enterpriseWorkspace, { and: [] })).toBe(true);
    });

    it("or requires at least one child to match", () => {
      expect(
        matchesWhere(freeWorkspace, {
          or: [{ isEnterprise: { eq: true } }, { isEnterprise: { eq: false } }],
        })
      ).toBe(true);
      expect(
        matchesWhere(freeWorkspace, {
          or: [
            { isEnterprise: { eq: true } },
            { featureFlags: { contains: "audit_logs" } },
          ],
        })
      ).toBe(false);
    });

    it("an empty `or` array never matches", () => {
      // `[].some(...)` is false, so an empty `or` excludes everything.
      expect(matchesWhere(enterpriseWorkspace, { or: [] })).toBe(false);
    });

    it("not inverts its child", () => {
      expect(
        matchesWhere(enterpriseWorkspace, {
          not: { isEnterprise: { eq: false } },
        })
      ).toBe(true);
      expect(
        matchesWhere(enterpriseWorkspace, {
          not: { isEnterprise: { eq: true } },
        })
      ).toBe(false);
    });

    it("supports nested logical operators", () => {
      // (enterprise AND (vertex flag OR audit flag)) AND NOT(deepseek flag)
      const where: Where<WorkspaceConfig> = {
        and: [
          { isEnterprise: { eq: true } },
          {
            or: [
              { featureFlags: { contains: "use_vertex_for_supported_models" } },
              { featureFlags: { contains: "audit_logs" } },
            ],
          },
        ],
        not: { featureFlags: { contains: "deepseek_feature" } },
      };
      expect(matchesWhere(enterpriseWorkspace, where)).toBe(true);
      expect(matchesWhere(freeWorkspace, where)).toBe(false);
    });

    it("combines logical operators with sibling field filters", () => {
      // Field filters and logical operators in the same `where` must all pass.
      expect(
        matchesWhere(enterpriseWorkspace, {
          isEnterprise: { eq: true },
          or: [
            { featureFlags: { contains: "anthropic_vertex_fallback" } },
            { featureFlags: { contains: "audit_logs" } },
          ],
        })
      ).toBe(true);
      expect(
        matchesWhere(enterpriseWorkspace, {
          isEnterprise: { eq: false },
          or: [{ featureFlags: { contains: "anthropic_vertex_fallback" } }],
        })
      ).toBe(false);
    });
  });

  describe("realistic endpoint availability scenarios", () => {
    // A gated endpoint: only available to enterprise workspaces that have the
    // vertex routing flag enabled.
    const gatedEndpointFilter: Where<WorkspaceConfig> = {
      isEnterprise: { eq: true },
      featureFlags: { contains: "use_vertex_for_supported_models" },
    };

    it("allows an eligible enterprise workspace", () => {
      expect(matchesWhere(enterpriseWorkspace, gatedEndpointFilter)).toBe(true);
    });

    it("rejects a non-enterprise workspace", () => {
      const enterpriseFlagOnly: WorkspaceConfig = {
        featureFlags: ["use_vertex_for_supported_models"],
        isEnterprise: false,
        isCreditPriced: false,
      };
      expect(matchesWhere(enterpriseFlagOnly, gatedEndpointFilter)).toBe(false);
    });

    it("rejects an enterprise workspace missing the flag", () => {
      const enterpriseNoFlag: WorkspaceConfig = {
        featureFlags: ["anthropic_vertex_fallback"],
        isEnterprise: true,
        isCreditPriced: false,
      };
      expect(matchesWhere(enterpriseNoFlag, gatedEndpointFilter)).toBe(false);
    });

    it("an empty endpoint filter is available to all workspaces", () => {
      // Matches the default `endpointFilter = {}` on the Dust Sonnet 4.6 config.
      expect(matchesWhere(enterpriseWorkspace, {})).toBe(true);
      expect(matchesWhere(freeWorkspace, {})).toBe(true);
    });
  });
});
