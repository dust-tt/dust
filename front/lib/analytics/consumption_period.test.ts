import {
  CONSUMPTION_PERIOD_DAY_OPTIONS,
  consumptionPeriodFromKey,
  consumptionPeriodLabel,
} from "@app/lib/analytics/consumption_period";
import { describe, expect, it } from "vitest";

describe("consumption period options", () => {
  it("includes the last 90 days preset", () => {
    expect(CONSUMPTION_PERIOD_DAY_OPTIONS).toContain(90);
    expect(consumptionPeriodFromKey("days:90")).toEqual({
      kind: "days",
      days: 90,
    });
    expect(consumptionPeriodLabel({ kind: "days", days: 90 })).toBe(
      "Last 90 days"
    );
  });
});
