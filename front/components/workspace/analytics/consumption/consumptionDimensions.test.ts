import {
  CONSUMPTION_DIMENSION_CONFIG,
  CONSUMPTION_DIMENSIONS,
  consumptionDimensionFromQueryParam,
  getConsumptionAttributionDimensions,
} from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { describe, expect, it } from "vitest";

describe("consumption dimension URL state", () => {
  it("reads valid dimensions and falls back to agents", () => {
    expect(consumptionDimensionFromQueryParam("user")).toBe("user");
    expect(consumptionDimensionFromQueryParam("api_key")).toBe("api_key");
    expect(consumptionDimensionFromQueryParam("invalid")).toBe("agent");
    expect(consumptionDimensionFromQueryParam(undefined)).toBe("agent");
  });

  it("registers the API key attribution tab", () => {
    expect(CONSUMPTION_DIMENSIONS).toEqual([
      "agent",
      "user",
      "group",
      "model",
      "tool",
      "skill",
      "source",
      "api_key",
    ]);
    expect(CONSUMPTION_DIMENSION_CONFIG.api_key.label).toBe("API keys");
  });

  it("selects the dimensions available to the analytics scope", () => {
    expect(getConsumptionAttributionDimensions({ personal: false })).toEqual(
      CONSUMPTION_DIMENSIONS
    );
    expect(getConsumptionAttributionDimensions({ personal: true })).toEqual([
      "agent",
      "model",
      "tool",
      "skill",
      "source",
      "api_key",
    ]);
  });
});
