import type { UsageFilterSourceOption } from "@app/components/workspace/analytics/usageFilter";
import {
  MAX_USAGE_FILTER_SELECTIONS,
  selectAllUsageFilterOptions,
  toConsumptionScopeFilter,
  toggleUsageFilterOption,
} from "@app/components/workspace/analytics/usageFilter";
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
            documentCount: 1,
            disabled: false,
          },
        ],
        team: [
          {
            id: "team-1",
            name: "Engineering",
            kind: "team",
            documentCount: 1,
            disabled: false,
          },
        ],
        tool: [
          {
            id: "tool-1",
            name: "Web search",
            kind: "tool",
            documentCount: 1,
            disabled: false,
          },
        ],
        skill: [
          {
            id: "skill-1",
            name: "Research",
            kind: "skill",
            documentCount: 1,
            disabled: false,
          },
        ],
        source: [
          {
            id: "slack",
            name: "Slack",
            kind: "source",
            connectorProvider: "slack",
            documentCount: 1,
            disabled: false,
          },
        ],
      })
    ).toEqual({
      users: ["member-1"],
      teams: ["team-1"],
      tools: ["tool-1"],
      skills: ["skill-1"],
      sources: ["slack"],
    });
  });

  it("omits empty member and team selections", () => {
    expect(toConsumptionScopeFilter({ member: [], team: [] })).toEqual({});
  });

  it("bounds the total number of selections serialized into analytics URLs", () => {
    const options: UsageFilterSourceOption[] = Array.from(
      { length: MAX_USAGE_FILTER_SELECTIONS + 5 },
      (_, index) => ({
        id: `source-${index}`,
        name: `Source ${index}`,
        kind: "source",
        connectorProvider: undefined,
        documentCount: 1,
        disabled: false,
      })
    );
    const atLimit = selectAllUsageFilterOptions({}, "source", options);

    expect(atLimit.source).toHaveLength(MAX_USAGE_FILTER_SELECTIONS);
    expect(toggleUsageFilterOption(atLimit, "source", options.at(-1)!)).toBe(
      atLimit
    );
    expect(
      toggleUsageFilterOption(atLimit, "source", options[0]).source
    ).toHaveLength(MAX_USAGE_FILTER_SELECTIONS - 1);
  });
});
