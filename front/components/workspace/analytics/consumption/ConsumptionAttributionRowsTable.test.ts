import { attributionColumnVisibility } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionRowsTable";
import { describe, expect, it } from "vitest";

describe("attributionColumnVisibility", () => {
  it("shows every column until the container is measured", () => {
    expect(Object.values(attributionColumnVisibility(null))).not.toContain(
      false
    );
  });

  it("hides columns from the least important as the container narrows", () => {
    expect(attributionColumnVisibility(1200)).toEqual({
      vsPrev: true,
      avgCredits: true,
      usageVsAverage: true,
      count: true,
      costShare: true,
      activeMembers: true,
    });
    expect(attributionColumnVisibility(700)).toEqual({
      vsPrev: false,
      avgCredits: false,
      usageVsAverage: false,
      count: true,
      costShare: true,
      activeMembers: true,
    });
    expect(attributionColumnVisibility(500)).toEqual({
      vsPrev: false,
      avgCredits: false,
      usageVsAverage: false,
      count: false,
      costShare: false,
      activeMembers: false,
    });
  });
});
