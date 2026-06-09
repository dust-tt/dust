import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponFactory } from "@app/tests/utils/CouponFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function validateCoupon(
  workspace: { sId: string },
  query: Record<string, string> = {}
) {
  const search = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${workspace.sId}/coupon/validate${search ? `?${search}` : ""}`
  );
}

describe("GET /api/w/:wId/coupon/validate", () => {
  it("returns 400 when code query param is missing", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await validateCoupon(workspace);

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns 404 for unknown coupon code", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await validateCoupon(workspace, { code: "UNKNOWN_CODE" });

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("coupon_not_found");
  });

  it("returns 200 and coupon for a valid code", async () => {
    const coupon = await CouponFactory.create({ code: "VALID10" });
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await validateCoupon(workspace, { code: coupon.code });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.coupon.code).toBe("VALID10");
    expect(data.coupon.amount).toBeDefined();
  });

  it("returns 400 for an expired coupon", async () => {
    const expired = await CouponFactory.create({
      expirationDate: new Date("2020-01-01"),
    });
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await validateCoupon(workspace, { code: expired.code });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("coupon_not_redeemable");
  });

  it("returns 400 for an exhausted coupon", async () => {
    const exhausted = await CouponFactory.create({
      maxRedemptions: 1,
      redemptionCount: 1,
    });
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await validateCoupon(workspace, { code: exhausted.code });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("coupon_not_redeemable");
  });

  it("returns 400 for an archived coupon", async () => {
    const archived = await CouponFactory.create({
      archivedAt: new Date("2023-01-01"),
    });
    const { workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const response = await validateCoupon(workspace, { code: archived.code });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("coupon_not_redeemable");
  });

  it("returns 400 when coupon already redeemed by this workspace", async () => {
    const coupon = await CouponFactory.create({ code: "ALREADYUSED" });
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    await CouponRedemptionResource.makeNew(auth, { coupon });

    const response = await validateCoupon(workspace, { code: coupon.code });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("coupon_already_redeemed");
  });
});
