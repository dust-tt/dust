import {
  CONSUMPTION_DIMENSIONS,
  consumptionDimensionFromQueryParam,
} from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { PERSONAL_CONSUMPTION_SCOPE_DIMENSIONS } from "@app/lib/api/analytics/consumption/scope";
import { describe, expect, it } from "vitest";

describe("consumption dimension URL state", () => {
  it("reads valid dimensions and falls back to agents", () => {
    expect(
      consumptionDimensionFromQueryParam("user", CONSUMPTION_DIMENSIONS)
    ).toBe("user");
    expect(
      consumptionDimensionFromQueryParam("invalid", CONSUMPTION_DIMENSIONS)
    ).toBe("agent");
    expect(
      consumptionDimensionFromQueryParam(undefined, CONSUMPTION_DIMENSIONS)
    ).toBe("agent");
  });

  it("falls back to agents for a dimension the scope does not offer", () => {
    expect(
      consumptionDimensionFromQueryParam(
        "user",
        PERSONAL_CONSUMPTION_SCOPE_DIMENSIONS
      )
    ).toBe("agent");
    expect(
      consumptionDimensionFromQueryParam(
        "group",
        PERSONAL_CONSUMPTION_SCOPE_DIMENSIONS
      )
    ).toBe("agent");
    expect(
      consumptionDimensionFromQueryParam(
        "model",
        PERSONAL_CONSUMPTION_SCOPE_DIMENSIONS
      )
    ).toBe("model");
  });
});
