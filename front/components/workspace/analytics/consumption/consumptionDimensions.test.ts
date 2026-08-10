import { consumptionDimensionFromQueryParam } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { describe, expect, it } from "vitest";

describe("consumption dimension URL state", () => {
  it("reads valid dimensions and falls back to agents", () => {
    expect(consumptionDimensionFromQueryParam("user")).toBe("user");
    expect(consumptionDimensionFromQueryParam("invalid")).toBe("agent");
    expect(consumptionDimensionFromQueryParam(undefined)).toBe("agent");
  });
});
