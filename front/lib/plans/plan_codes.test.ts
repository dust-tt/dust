import { describe, expect, it } from "vitest";

import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  CREDIT_PRICED_FREE_PLAN_CODE,
  FREE_NO_PLAN_CODE,
  isFreePlan,
} from "@app/lib/plans/plan_codes";

describe("isFreePlan", () => {
  it("is false for custom credit-priced business plans", () => {
    expect(isFreePlan("CP_BUSINESS_SWEEP")).toBe(false);
  });

  it("is false for the standard credit-priced business plan", () => {
    expect(isFreePlan(CREDIT_PRICED_BUSINESS_PLAN_CODE)).toBe(false);
  });

  it("is true for free plans", () => {
    expect(isFreePlan(CREDIT_PRICED_FREE_PLAN_CODE)).toBe(true);
    expect(isFreePlan(FREE_NO_PLAN_CODE)).toBe(true);
  });
});
