import { Authenticator } from "@app/lib/auth";
import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { CouponFactory } from "@app/tests/utils/CouponFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

describe("CouponRedemptionResource.makeNew", () => {
  it("returns a resource with correct sIds", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const coupon = await CouponFactory.create();

    const redemption = await CouponRedemptionResource.makeNew(auth, { coupon });

    expect(redemption.workspaceSId).toBe(workspace.sId);
    expect(redemption.couponSId).toBe(coupon.sId);
    expect(redemption.redeemedByUserSId).toBeNull();
    expect(redemption.sId).toBeDefined();
  });

  it("records the redeeming user's sId", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const coupon = await CouponFactory.create();

    const redemption = await CouponRedemptionResource.makeNew(auth, { coupon });

    expect(redemption.redeemedByUserSId).toBe(user.sId);
  });

  it("increments the coupon redemptionCount", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const coupon = await CouponFactory.create({ maxRedemptions: 10 });

    await CouponRedemptionResource.makeNew(auth, { coupon });

    const updated = await CouponResource.fetchByCouponId(coupon.sId);
    expect(updated?.redemptionCount).toBe(1);
  });

  it("enforces one redemption per workspace per coupon", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const coupon = await CouponFactory.create();

    await CouponRedemptionResource.makeNew(auth, { coupon });
    await expect(
      CouponRedemptionResource.makeNew(auth, { coupon })
    ).rejects.toThrow();
  });
});

describe("CouponRedemptionResource.listAllByCoupon", () => {
  it("returns an empty array when no redemptions exist", async () => {
    const coupon = await CouponFactory.create();
    const redemptions = await CouponRedemptionResource.listAllByCoupon(coupon);
    expect(redemptions).toHaveLength(0);
  });

  it("returns all redemptions across workspaces and increments count per redemption", async () => {
    const [ws1, ws2] = await Promise.all([
      WorkspaceFactory.basic(),
      WorkspaceFactory.basic(),
    ]);
    const [auth1, auth2] = await Promise.all([
      Authenticator.internalAdminForWorkspace(ws1.sId),
      Authenticator.internalAdminForWorkspace(ws2.sId),
    ]);
    const coupon = await CouponFactory.create();

    await CouponRedemptionResource.makeNew(auth1, { coupon });
    await CouponRedemptionResource.makeNew(auth2, { coupon });

    const redemptions = await CouponRedemptionResource.listAllByCoupon(coupon);
    expect(redemptions).toHaveLength(2);
    expect(redemptions.map((r) => r.workspaceSId).sort()).toEqual(
      [ws1.sId, ws2.sId].sort()
    );

    const updated = await CouponResource.fetchByCouponId(coupon.sId);
    expect(updated?.redemptionCount).toBe(2);
  });

  it("resolves redeemedByUserSId when a user redeemed", async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const coupon = await CouponFactory.create();

    await CouponRedemptionResource.makeNew(auth, { coupon });

    const [redemption] = await CouponRedemptionResource.listAllByCoupon(coupon);
    expect(redemption.redeemedByUserSId).toBe(user.sId);
  });
});

describe("CouponRedemptionResource.delete", () => {
  it("removes the redemption", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const coupon = await CouponFactory.create();

    const redemption = await CouponRedemptionResource.makeNew(auth, { coupon });
    const result = await redemption.delete(auth);

    expect(result.isOk()).toBe(true);
    const remaining = await CouponRedemptionResource.listAllByCoupon(coupon);
    expect(remaining).toHaveLength(0);
  });
});
