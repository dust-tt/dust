import {
  getUsageFilterSummaries,
  setUsageFilterFromAttributionRow,
  toConsumptionScopeFilter,
} from "@app/components/workspace/analytics/usageFilter";
import type { ConsumptionScopeDimension } from "@app/lib/api/analytics/consumption/scope";
import { describe, expect, it } from "vitest";

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
      })
    ).toEqual({
      users: ["member-1"],
      groups: ["group-1"],
      tools: ["tool-1"],
      skills: ["skill-1"],
      sources: ["slack"],
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
        agent: [
          {
            id: "previous-agent",
            name: "Previous agent",
            kind: "agent",
            image: null,
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
      "agent",
      row
    );

    expect(filter.agent).toEqual([
      {
        id: row.id,
        name: row.name,
        kind: "agent",
        image: row.pictureUrl,
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
