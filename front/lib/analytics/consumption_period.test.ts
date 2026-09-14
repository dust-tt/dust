import { CONSUMPTION_PERIOD_DAY_OPTIONS } from "@app/lib/analytics/consumption_period";
import { describe, expect, it } from "vitest";

describe("consumption period options", () => {
  it("includes the last 90 days preset", () => {
    expect(CONSUMPTION_PERIOD_DAY_OPTIONS).toContain(90);
  });
});
