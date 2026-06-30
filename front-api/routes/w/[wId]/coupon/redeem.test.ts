import { CouponFactory } from "@app/tests/utils/CouponFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function redeem(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/coupon/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/coupon/redeem", () => {
  it("returns 400 when code is missing", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await redeem(workspace, {});

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 404 for an unknown coupon code", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await redeem(workspace, { code: "UNKNOWN" });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("coupon_not_found");
  });

  it("returns 400 (coupon_not_redeemable) for a seat coupon", async () => {
    const coupon = await CouponFactory.create({ discountType: "seat" });
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await redeem(workspace, { code: coupon.code });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("coupon_not_redeemable");
  });

  it("returns 400 for a non-admin (regular member)", async () => {
    const coupon = await CouponFactory.create({
      discountType: "credit_pool_top_up",
    });
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const response = await redeem(workspace, { code: coupon.code });

    expect(response.status).toBe(403);
  });
});
