import {
  addUsageFilterFromAttributionRow,
  getUsageFilterCategories,
  getUsageFilterSummaries,
  removeUsageFilterFromAttributionRow,
  setUsageFilterFromAttributionRow,
  toConsumptionScopeFilter,
} from "@app/components/workspace/analytics/usageFilter";
import type { ConsumptionScopeDimension } from "@app/types/api/analytics/consumption";
import { describe, expect, it } from "vitest";

describe("getUsageFilterCategories", () => {
  it("selects the categories available to the analytics scope", () => {
    expect(getUsageFilterCategories()).toEqual([
      "agent",
      "member",
      "group",
      "model",
      "tool",
      "skill",
      "source",
      "api_key",
    ]);
    expect(getUsageFilterCategories({ kind: "personal" })).toEqual([
      "agent",
      "model",
      "tool",
      "skill",
      "source",
      "api_key",
    ]);
    expect(
      getUsageFilterCategories({ kind: "agent", agentId: "agent-1" })
    ).toEqual([
      "member",
      "group",
      "model",
      "tool",
      "skill",
      "source",
      "api_key",
    ]);
  });
});

describe("toConsumptionScopeFilter", () => {
  it("maps every selected facet to its consumption scope dimension", () => {
    expect(
      toConsumptionScopeFilter({
        member: [
          {
            id: "member-1",
            name: "Ada",
            kind: "member",
            image: null,
            disabled: false,
          },
        ],
        group: [
          {
            id: "group-1",
            name: "Engineering",
            kind: "group",
            disabled: false,
          },
        ],
        tool: [
          {
            id: "tool-1",
            name: "Web search",
            kind: "tool",
            icon: null,
            disabled: false,
          },
        ],
        skill: [
          {
            id: "skill-1",
            name: "Research",
            kind: "skill",
            icon: null,
            disabled: false,
          },
        ],
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

  it("omits empty member and group selections", () => {
    expect(toConsumptionScopeFilter({ member: [], group: [] })).toEqual({});
  });
});

describe("setUsageFilterFromAttributionRow", () => {
  const row = {
    id: "selected-row",
    name: "Selected row",
    pictureUrl: "https://example.com/avatar.png",
  };

  it.each<{
    dimension: ConsumptionScopeDimension;
    expectedScopeFilter: Record<string, string[]>;
  }>([
    { dimension: "agent", expectedScopeFilter: { agents: [row.id] } },
    { dimension: "user", expectedScopeFilter: { users: [row.id] } },
    { dimension: "group", expectedScopeFilter: { groups: [row.id] } },
    { dimension: "model", expectedScopeFilter: { models: [row.id] } },
    { dimension: "tool", expectedScopeFilter: { tools: [row.id] } },
    { dimension: "skill", expectedScopeFilter: { skills: [row.id] } },
    { dimension: "source", expectedScopeFilter: { sources: [row.id] } },
    { dimension: "api_key", expectedScopeFilter: { api_keys: [row.id] } },
  ])("maps a $dimension row to its page-level filter", ({
    dimension,
    expectedScopeFilter,
  }) => {
    const filter = setUsageFilterFromAttributionRow({}, dimension, row);

    expect(toConsumptionScopeFilter(filter)).toEqual(expectedScopeFilter);
  });

  it("replaces the selected dimension while preserving other filters", () => {
    const filter = setUsageFilterFromAttributionRow(
      {
        api_key: [
          {
            id: "previous-api-key",
            name: "Previous API key",
            kind: "api_key",
            disabled: false,
          },
        ],
        tool: [
          {
            id: "tool-1",
            name: "Web search",
            kind: "tool",
            icon: null,
            disabled: false,
          },
        ],
      },
      "api_key",
      row
    );

    expect(filter.api_key).toEqual([
      {
        id: row.id,
        name: row.name,
        kind: "api_key",
        disabled: false,
      },
    ]);
    expect(filter.tool?.map(({ id }) => id)).toEqual(["tool-1"]);
  });
});

describe("getUsageFilterSummaries", () => {
  it("flattens selected options into ordered, human-readable categories", () => {
    expect(
      getUsageFilterSummaries({
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
      })
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

  it("omits empty categories", () => {
    expect(getUsageFilterSummaries({ group: [] })).toEqual([]);
  });
});

describe("addUsageFilterFromAttributionRow", () => {
  const row = {
    id: "selected-member",
    name: "Ada",
    pictureUrl: null,
  };

  it("adds a row while preserving existing selections", () => {
    const filter = addUsageFilterFromAttributionRow(
      {
        member: [
          {
            id: "existing-member",
            name: "Grace",
            kind: "member",
            image: null,
            disabled: false,
          },
        ],
      },
      "user",
      row
    );

    expect(filter.member?.map(({ id }) => id)).toEqual([
      "existing-member",
      row.id,
    ]);
  });

  it("does not duplicate an already selected row", () => {
    const once = addUsageFilterFromAttributionRow({}, "user", row);
    const twice = addUsageFilterFromAttributionRow(once, "user", row);

    expect(twice).toEqual(once);
  });
});

describe("removeUsageFilterFromAttributionRow", () => {
  const row = {
    id: "selected-member",
    name: "Ada",
    pictureUrl: null,
  };

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
    const added = addUsageFilterFromAttributionRow({}, dimension, row);

    expect(toConsumptionScopeFilter(added)).not.toEqual({});

    const removed = removeUsageFilterFromAttributionRow(added, dimension, row);

    expect(toConsumptionScopeFilter(removed)).toEqual({});
  });

  it("removes only the targeted row, preserving other selections", () => {
    const filter = addUsageFilterFromAttributionRow(
      {
        member: [
          {
            id: "other-member",
            name: "Grace",
            kind: "member",
            image: null,
            disabled: false,
          },
        ],
      },
      "user",
      row
    );

    const removed = removeUsageFilterFromAttributionRow(filter, "user", row);

    expect(removed.member?.map(({ id }) => id)).toEqual(["other-member"]);
  });

  it("preserves other categories when clearing the targeted one", () => {
    const filter = addUsageFilterFromAttributionRow(
      {
        tool: [
          {
            id: "tool-1",
            name: "Web search",
            kind: "tool",
            icon: null,
            disabled: false,
          },
        ],
      },
      "user",
      row
    );

    const removed = removeUsageFilterFromAttributionRow(filter, "user", row);

    expect(removed.member).toBeUndefined();
    expect(removed.tool?.map(({ id }) => id)).toEqual(["tool-1"]);
  });

  it("is a no-op when the row is not selected", () => {
    const filter = addUsageFilterFromAttributionRow({}, "user", {
      id: "other-member",
      name: "Grace",
      pictureUrl: null,
    });

    const removed = removeUsageFilterFromAttributionRow(filter, "user", row);

    expect(removed).toEqual(filter);
  });
});
