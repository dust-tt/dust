import { CouponFactory } from "@app/tests/utils/CouponFactory";
import { describe, expect, it } from "vitest";

describe("CouponResource.validateRedemption", () => {
  it("returns Ok for a valid coupon with no restrictions", async () => {
    const coupon = await CouponFactory.create();
    expect(coupon.validateRedemption().isOk()).toBe(true);
  });

  it("returns Ok when maxRedemptions is not reached", async () => {
    const coupon = await CouponFactory.create({
      maxRedemptions: 5,
      redemptionCount: 4,
    });
    expect(coupon.validateRedemption().isOk()).toBe(true);
  });

  it("returns 'archived' when coupon is archived", async () => {
    const coupon = await CouponFactory.create({ archivedAt: new Date() });
    const result = coupon.validateRedemption();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("archived");
    }
  });

  it("returns 'expired' when redeemBy is in the past", async () => {
    const past = new Date(Date.now() - 1000);
    const coupon = await CouponFactory.create({ redeemBy: past });
    const result = coupon.validateRedemption();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("expired");
    }
  });

  it("returns 'exhausted' when redemptionCount equals maxRedemptions", async () => {
    const coupon = await CouponFactory.create({
      maxRedemptions: 3,
      redemptionCount: 3,
    });
    const result = coupon.validateRedemption();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("exhausted");
    }
  });
});
