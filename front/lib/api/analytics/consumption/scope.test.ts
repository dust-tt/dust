import {
  buildConsumptionScopeQuery,
  creditsFromMicroCredits,
} from "@app/lib/api/analytics/consumption/scope";
import { describe, expect, it } from "vitest";

const WINDOW = {
  startDate: "2026-07-01T00:00:00.000Z",
  endDate: "2026-07-13T00:00:00.000Z",
};

describe("buildConsumptionScopeQuery", () => {
  it("scopes to the workspace over a half-open window", () => {
    expect(
      buildConsumptionScopeQuery({ workspaceId: "w1", ...WINDOW })
    ).toEqual({
      bool: {
        filter: [
          { term: { workspace_id: "w1" } },
          {
            range: {
              completed_at: { gte: WINDOW.startDate, lt: WINDOW.endDate },
            },
          },
        ],
      },
    });
  });

  it("maps each dimension to its index field, single value as a term", () => {
    const query = buildConsumptionScopeQuery({
      workspaceId: "w1",
      ...WINDOW,
      filter: {
        agent: ["a1"],
        member: ["u1", "u2"],
        model: ["gpt-5.6-luna"],
        tool: ["web_search_&_browse"],
        skill: ["s1"],
        source: ["web"],
      },
    });

    expect(query.bool?.filter).toEqual([
      { term: { workspace_id: "w1" } },
      expect.objectContaining({ range: expect.anything() }),
      { term: { "agent.id": "a1" } },
      { terms: { "user.id": ["u1", "u2"] } },
      { term: { "model.model_id": "gpt-5.6-luna" } },
      { term: { "tool.server_name": "web_search_&_browse" } },
      { term: { "tool.attributed_skill_ids": "s1" } },
      { term: { context_origin: "web" } },
    ]);
  });

  it("ignores empty selections", () => {
    const query = buildConsumptionScopeQuery({
      workspaceId: "w1",
      ...WINDOW,
      filter: { agent: [], member: [""] },
    });

    expect(query.bool?.filter).toHaveLength(2);
  });
});

describe("creditsFromMicroCredits", () => {
  it("converts micro-credits without rounding", () => {
    expect(creditsFromMicroCredits(1_570_588)).toBeCloseTo(1.570588);
    expect(creditsFromMicroCredits(0)).toBe(0);
  });
});
