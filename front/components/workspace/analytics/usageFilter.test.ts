import type {
  UsageFilter,
  UsageFilterOptionsByCategory,
} from "@app/components/workspace/analytics/usageFilter";
import {
  addUsageFilterDimensionId,
  getUsageFilterSummaries,
  indexUsageFilterOptions,
  pruneUsageFilter,
  removeUsageFilterDimensionId,
  resolveUsageFilterOptions,
  setUsageFilterDimensionId,
  toConsumptionScopeFilter,
} from "@app/components/workspace/analytics/usageFilter";
import type { ConsumptionScopeDimension } from "@app/lib/api/analytics/consumption/scope";
import { describe, expect, it } from "vitest";

const OPTIONS: UsageFilterOptionsByCategory = {
  agent: [
    {
      id: "agent-1",
      name: "@dust",
      kind: "agent",
      image: null,
      disabled: false,
    },
  ],
  member: [
    {
      id: "member-1",
      name: "Nath",
      kind: "member",
      image: null,
      disabled: false,
    },
    {
      id: "member-2",
      name: "Adrien",
      kind: "member",
      image: null,
      disabled: false,
    },
  ],
  group: [
    { id: "group-1", name: "Engineering", kind: "group", disabled: false },
  ],
  model: [],
  tool: [
    {
      id: "tool-1",
      name: "Web search",
      kind: "tool",
      icon: null,
      disabled: false,
    },
  ],
  skill: [],
  source: [
    {
      id: "slack",
      name: "Slack",
      kind: "source",
      connectorProvider: "slack",
      disabled: false,
    },
  ],
  api_key: [
    {
      id: "api-key-1",
      name: "Production key",
      kind: "api_key",
      disabled: false,
    },
  ],
};

const OPTION_INDEX = indexUsageFilterOptions(OPTIONS);

describe("toConsumptionScopeFilter", () => {
  it("maps every selected category to its consumption dimension", () => {
    expect(
      toConsumptionScopeFilter({
        member: ["member-1"],
        group: ["group-1"],
        tool: ["tool-1"],
        skill: ["skill-1"],
        source: ["slack"],
        api_key: ["api-key-1"],
      })
    ).toEqual({
      users: ["member-1"],
      groups: ["group-1"],
      tools: ["tool-1"],
      skills: ["skill-1"],
      sources: ["slack"],
      api_keys: ["api-key-1"],
    });
  });

  it("omits empty selections", () => {
    expect(toConsumptionScopeFilter({ member: [], group: [] })).toEqual({});
  });
});

describe("setUsageFilterDimensionId", () => {
  it.each<{
    dimension: ConsumptionScopeDimension;
    expectedScopeFilter: Record<string, string[]>;
  }>([
    { dimension: "agent", expectedScopeFilter: { agents: ["row-1"] } },
    { dimension: "user", expectedScopeFilter: { users: ["row-1"] } },
    { dimension: "group", expectedScopeFilter: { groups: ["row-1"] } },
    { dimension: "model", expectedScopeFilter: { models: ["row-1"] } },
    { dimension: "tool", expectedScopeFilter: { tools: ["row-1"] } },
    { dimension: "skill", expectedScopeFilter: { skills: ["row-1"] } },
    { dimension: "source", expectedScopeFilter: { sources: ["row-1"] } },
    { dimension: "api_key", expectedScopeFilter: { api_keys: ["row-1"] } },
  ])("maps a $dimension row to its page-level filter", ({
    dimension,
    expectedScopeFilter,
  }) => {
    expect(
      toConsumptionScopeFilter(
        setUsageFilterDimensionId({}, dimension, "row-1")
      )
    ).toEqual(expectedScopeFilter);
  });

  it("replaces the selected dimension while preserving other filters", () => {
    const filter = setUsageFilterDimensionId(
      { api_key: ["previous-api-key"], tool: ["tool-1"] },
      "api_key",
      "row-1"
    );

    expect(filter.api_key).toEqual(["row-1"]);
    expect(filter.tool).toEqual(["tool-1"]);
  });
});

describe("addUsageFilterDimensionId", () => {
  it("adds a row while preserving existing selections", () => {
    expect(
      addUsageFilterDimensionId(
        { member: ["existing-member"] },
        "user",
        "member-1"
      ).member
    ).toEqual(["existing-member", "member-1"]);
  });

  it("does not duplicate an already selected row", () => {
    const once = addUsageFilterDimensionId({}, "user", "member-1");

    expect(addUsageFilterDimensionId(once, "user", "member-1")).toEqual(once);
  });
});

describe("removeUsageFilterDimensionId", () => {
  it.each<{ dimension: ConsumptionScopeDimension }>([
    { dimension: "agent" },
    { dimension: "user" },
    { dimension: "group" },
    { dimension: "model" },
    { dimension: "tool" },
    { dimension: "skill" },
    { dimension: "source" },
    { dimension: "api_key" },
  ])("removes a previously added $dimension row, clearing the category", ({
    dimension,
  }) => {
    const added = addUsageFilterDimensionId({}, dimension, "row-1");

    expect(toConsumptionScopeFilter(added)).not.toEqual({});
    expect(
      toConsumptionScopeFilter(
        removeUsageFilterDimensionId(added, dimension, "row-1")
      )
    ).toEqual({});
  });

  it("removes only the targeted row, preserving other categories", () => {
    const filter: UsageFilter = {
      member: ["member-1", "member-2"],
      tool: ["tool-1"],
    };

    expect(removeUsageFilterDimensionId(filter, "user", "member-1")).toEqual({
      member: ["member-2"],
      tool: ["tool-1"],
    });
  });

  it("is a no-op when the row is not selected", () => {
    const filter: UsageFilter = { member: ["member-1"] };

    expect(removeUsageFilterDimensionId(filter, "user", "member-2")).toEqual(
      filter
    );
  });
});

describe("getUsageFilterSummaries", () => {
  it("resolves names from the facet index, in category order", () => {
    expect(
      getUsageFilterSummaries(
        { member: ["member-1", "member-2"], agent: ["agent-1"] },
        OPTION_INDEX
      )
    ).toEqual([
      {
        category: "agent",
        categoryLabel: "Agent",
        options: [{ id: "agent-1", name: "@dust" }],
      },
      {
        category: "member",
        categoryLabel: "Member",
        options: [
          { id: "member-1", name: "Nath" },
          { id: "member-2", name: "Adrien" },
        ],
      },
    ]);
  });

  it("falls back to the id until the facets land", () => {
    expect(
      getUsageFilterSummaries({ agent: ["agent-9"] }, OPTION_INDEX)
    ).toEqual([
      {
        category: "agent",
        categoryLabel: "Agent",
        options: [{ id: "agent-9", name: "agent-9" }],
      },
    ]);
  });

  it("omits empty categories", () => {
    expect(getUsageFilterSummaries({ group: [] }, OPTION_INDEX)).toEqual([]);
  });
});

describe("resolveUsageFilterOptions", () => {
  it("keeps the selection order and drops what the facets do not cover", () => {
    expect(
      resolveUsageFilterOptions(
        { member: ["member-2", "member-1"], model: ["gone"] },
        OPTION_INDEX
      )
    ).toEqual({
      member: [OPTIONS.member[1], OPTIONS.member[0]],
    });
  });
});

describe("pruneUsageFilter", () => {
  it("returns null when every id resolves", () => {
    expect(
      pruneUsageFilter(
        { member: ["member-1"], source: ["slack"] },
        OPTION_INDEX
      )
    ).toBeNull();
  });

  it("drops an id that no longer resolves", () => {
    expect(
      pruneUsageFilter(
        { member: ["member-1", "deleted-member"], model: ["deleted-model"] },
        OPTION_INDEX
      )
    ).toEqual({ member: ["member-1"] });
  });
});
