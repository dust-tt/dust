import {
  CONSUMPTION_DIMENSION_CONFIG,
  CONSUMPTION_DIMENSIONS,
  consumptionDimensionFromQueryParam,
} from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { describe, expect, it } from "vitest";

describe("consumption dimension URL state", () => {
  it("reads valid dimensions and falls back to agents", () => {
    expect(consumptionDimensionFromQueryParam("user")).toBe("user");
    expect(consumptionDimensionFromQueryParam("api_key")).toBe("agent");
    expect(consumptionDimensionFromQueryParam("invalid")).toBe("agent");
    expect(consumptionDimensionFromQueryParam(undefined)).toBe("agent");
  });

  it("registers the consumption attribution tabs", () => {
    expect(CONSUMPTION_DIMENSIONS).toEqual([
      "agent",
      "user",
      "group",
      "model",
      "tool",
      "skill",
      "source",
    ]);
    expect(CONSUMPTION_DIMENSION_CONFIG.agent.label).toBe("Agents");
  });
});
