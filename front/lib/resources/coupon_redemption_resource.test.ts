import { Authenticator } from "@app/lib/auth";
import { CouponRedemptionResource } from "@app/lib/resources/coupon_redemption_resource";
import { CouponResource } from "@app/lib/resources/coupon_resource";
import { CouponFactory } from "@app/tests/utils/CouponFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

async function makeWorkspaceWithUserAuth() {
  const ws = await WorkspaceFactory.basic();
  const user = await UserFactory.basic();
  await MembershipFactory.associate(ws, user, { role: "user" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, ws.sId);
  return { workspace: ws, user, auth };
}

describe("CouponRedemptionResource.makeNew", () => {
  it("returns a resource with correct sIds", async () => {
    const { workspace, user, auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();

    const redemption = await CouponRedemptionResource.makeNew(auth, { coupon });

    expect(redemption.workspaceSId).toBe(workspace.sId);
    expect(redemption.couponSId).toBe(coupon.sId);
    expect(redemption.redeemedByUserSId).toBe(user.sId);
    expect(redemption.sId).toBeDefined();
  });

  it("records the redeeming user's sId", async () => {
    const { user, auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();

    const redemption = await CouponRedemptionResource.makeNew(auth, { coupon });

    expect(redemption.redeemedByUserSId).toBe(user.sId);
  });

  it("creates redemption with pending status and empty metronomeCreditIds", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();

    const redemption = await CouponRedemptionResource.makeNew(auth, { coupon });

    expect(redemption.status).toBe("pending");
    expect(redemption.metronomeCreditIds).toEqual([]);
  });

  it("enforces at most one pending/active redemption per workspace per coupon", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();

    await CouponRedemptionResource.makeNew(auth, { coupon });
    await expect(
      CouponRedemptionResource.makeNew(auth, { coupon })
    ).rejects.toThrow();
  });
});

describe("CouponRedemptionResource lifecycle methods", () => {
  it("markActive sets status to active and stores credit IDs", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();
    const redemption = await CouponRedemptionResource.makeNew(auth, { coupon });

    const creditIds = ["credit-1", "credit-2"];
    const result = await redemption.markActive(creditIds);

    expect(result.isOk()).toBe(true);
    expect(redemption.status).toBe("active");
    expect(redemption.metronomeCreditIds).toEqual(creditIds);
  });

  it("markFailed sets status to failed", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();
    const redemption = await CouponRedemptionResource.makeNew(auth, { coupon });

    const result = await redemption.markFailed();

    expect(result.isOk()).toBe(true);
    expect(redemption.status).toBe("failed");
  });

  it("markRevoked sets status to revoked", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();
    const redemption = await CouponRedemptionResource.makeNew(auth, { coupon });
    await redemption.markActive(["credit-1"]);

    const result = await redemption.markRevoked();

    expect(result.isOk()).toBe(true);
    expect(redemption.status).toBe("revoked");
  });

  it("allows a new redemption after a failed one for the same workspace+coupon", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();

    const first = await CouponRedemptionResource.makeNew(auth, { coupon });
    await first.markFailed();

    const second = await CouponRedemptionResource.makeNew(auth, { coupon });
    expect(second.status).toBe("pending");
  });
});

describe("CouponRedemptionResource.listAllByCoupon", () => {
  it("returns an empty array when no redemptions exist", async () => {
    const coupon = await CouponFactory.create();
    const redemptions = await CouponRedemptionResource.listAllByCoupon(coupon);
    expect(redemptions).toHaveLength(0);
  });

  it("returns all redemptions across workspaces", async () => {
    const [{ workspace: ws1, auth: auth1 }, { workspace: ws2, auth: auth2 }] =
      await Promise.all([
        makeWorkspaceWithUserAuth(),
        makeWorkspaceWithUserAuth(),
      ]);
    const coupon = await CouponFactory.create();

    await CouponRedemptionResource.makeNew(auth1, { coupon });
    await CouponRedemptionResource.makeNew(auth2, { coupon });

    const redemptions = await CouponRedemptionResource.listAllByCoupon(coupon);
    expect(redemptions).toHaveLength(2);
    expect(redemptions.map((r) => r.workspaceSId).sort()).toEqual(
      [ws1.sId, ws2.sId].sort()
    );
  });

  it("resolves redeemedByUserSId when a user redeemed", async () => {
    const { user, auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();

    await CouponRedemptionResource.makeNew(auth, { coupon });

    const [redemption] = await CouponRedemptionResource.listAllByCoupon(coupon);
    expect(redemption.redeemedByUserSId).toBe(user.sId);
  });
});

describe("CouponResource.incrementRedemptionCount / decrementRedemptionCount", () => {
  it("increments and decrements independently of redemption creation", async () => {
    const coupon = await CouponFactory.create();

    await coupon.incrementRedemptionCount();
    await coupon.incrementRedemptionCount();

    const afterIncrement = await CouponResource.fetchByCouponId(coupon.sId);
    expect(afterIncrement?.redemptionCount).toBe(2);

    await coupon.decrementRedemptionCount();

    const afterDecrement = await CouponResource.fetchByCouponId(coupon.sId);
    expect(afterDecrement?.redemptionCount).toBe(1);
  });
});

describe("CouponRedemptionResource.delete", () => {
  it("removes the redemption", async () => {
    const { auth } = await makeWorkspaceWithUserAuth();
    const coupon = await CouponFactory.create();

    const redemption = await CouponRedemptionResource.makeNew(auth, { coupon });
    const result = await redemption.delete(auth);

    expect(result.isOk()).toBe(true);
    const remaining = await CouponRedemptionResource.listAllByCoupon(coupon);
    expect(remaining).toHaveLength(0);
  });
});
