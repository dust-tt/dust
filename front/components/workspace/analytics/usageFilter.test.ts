import { toConsumptionScopeFilter } from "@app/components/workspace/analytics/usageFilter";
import { describe, expect, it } from "vitest";

describe("toConsumptionScopeFilter", () => {
  it("maps selected members and teams to consumption scope ids", () => {
    expect(
      toConsumptionScopeFilter({
        member: [{ id: "member-1", name: "Ada", kind: "member", image: null }],
        team: [
          {
            id: "team-1",
            name: "Engineering",
            kind: "team",
          },
        ],
      })
    ).toEqual({ users: ["member-1"], teams: ["team-1"] });
  });

  it("omits empty member and team selections", () => {
    expect(toConsumptionScopeFilter({ member: [], team: [] })).toEqual({});
  });
});
