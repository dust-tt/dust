import { toConsumptionScopeFilter } from "@app/components/workspace/analytics/usageFilter";
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
        group: [
          {
            id: "group-1",
            name: "Engineering",
            kind: "group",
            documentCount: 1,
            disabled: false,
          },
        ],
        tool: [
          {
            id: "tool-1",
            name: "Web search",
            kind: "tool",
            icon: null,
            documentCount: 1,
            disabled: false,
          },
        ],
        skill: [
          {
            id: "skill-1",
            name: "Research",
            kind: "skill",
            icon: null,
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
