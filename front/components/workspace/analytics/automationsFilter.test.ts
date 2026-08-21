import {
  automationsFilterSelectionCount,
  getAutomationsFilterSummaries,
  toAutomationsScopeFilter,
  toAutomationsTriggersFilter,
} from "@app/components/workspace/analytics/automationsFilter";
import { describe, expect, it } from "vitest";

const agentOption = {
  id: "agent-1",
  name: "@dust",
  category: "agent" as const,
  disabled: false,
  image: null,
};

const memberOption = {
  id: "member-1",
  name: "Ada",
  category: "member" as const,
  disabled: false,
  image: null,
};

describe("toAutomationsTriggersFilter", () => {
  it("maps every selected category to its triggers filter field", () => {
    expect(
      toAutomationsTriggersFilter({
        agent: [agentOption],
        member: [memberOption],
        type: [
          {
            id: "schedule",
            name: "Schedule",
            category: "type",
            disabled: false,
          },
          { id: "webhook", name: "Webhook", category: "type", disabled: false },
        ],
      })
    ).toEqual({
      agentIds: ["agent-1"],
      editorIds: ["member-1"],
      kinds: ["schedule", "webhook"],
    });
  });

  it("omits empty selections", () => {
    expect(toAutomationsTriggersFilter({})).toEqual({});
    expect(
      toAutomationsTriggersFilter({ agent: [], member: [], type: [] })
    ).toEqual({});
  });

  it("drops type ids that are not valid trigger kinds", () => {
    expect(
      toAutomationsTriggersFilter({
        type: [
          {
            id: "schedule",
            name: "Schedule",
            category: "type",
            disabled: false,
          },
          {
            id: "not-a-kind",
            name: "Unknown",
            category: "type",
            disabled: false,
          },
        ],
      })
    ).toEqual({ kinds: ["schedule"] });
  });

  it("only maps the selected categories, leaving the others out", () => {
    expect(toAutomationsTriggersFilter({ agent: [agentOption] })).toEqual({
      agentIds: ["agent-1"],
    });
  });
});

describe("toAutomationsScopeFilter", () => {
  it("maps agents and members to their consumption dimensions", () => {
    expect(
      toAutomationsScopeFilter({
        agent: [agentOption],
        member: [memberOption],
      })
    ).toEqual({
      agents: ["agent-1"],
      users: ["member-1"],
    });
  });

  it("drops the type category, which is not a consumption dimension", () => {
    expect(
      toAutomationsScopeFilter({
        type: [
          {
            id: "schedule",
            name: "Schedule",
            category: "type",
            disabled: false,
          },
        ],
      })
    ).toEqual({});
  });

  it("omits empty categories", () => {
    expect(toAutomationsScopeFilter({ agent: [], member: [] })).toEqual({});
  });
});

describe("automationsFilterSelectionCount", () => {
  it("sums the selection count across all categories", () => {
    expect(
      automationsFilterSelectionCount({
        agent: [agentOption],
        member: [memberOption],
      })
    ).toBe(2);
  });

  it("is zero for an empty filter", () => {
    expect(automationsFilterSelectionCount({})).toBe(0);
  });
});

describe("getAutomationsFilterSummaries", () => {
  it("flattens selected options into ordered, human-readable categories", () => {
    expect(
      getAutomationsFilterSummaries({
        agent: [agentOption],
        member: [memberOption],
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
        options: [{ id: "member-1", name: "Ada" }],
      },
    ]);
  });

  it("omits empty categories", () => {
    expect(getAutomationsFilterSummaries({ type: [] })).toEqual([]);
  });
});
