import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import type { Stripe } from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_CHECKOUT_URL = "https://checkout.stripe.com/test-session";
const TEST_CLIENT_SECRET = "cs_test_client_secret";
const TEST_SESSION_ID = "cs_test_session_id";

vi.mock("@app/lib/plans/stripe", async () => {
  return {
    createStripeSubscriptionCheckoutSession: vi
      .fn()
      .mockResolvedValue("https://checkout.stripe.com/test-session"),
    createEmbeddedMetronomeSetupCheckoutSession: vi.fn().mockResolvedValue({
      clientSecret: "cs_test_client_secret",
      sessionId: "cs_test_session_id",
    }),
    getProPlanStripeProductId: vi.fn().mockResolvedValue("testProductID"),
    getStripeSubscription: vi.fn().mockResolvedValue({
      id: "sub_test123",
      object: "subscription",
      status: "active",
    } as Stripe.Subscription),
  };
});

function post(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/subscriptions`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Grants the workspace-level "admin" capability on "billing" to a non-admin user by placing them
// in a group that holds a type-wide grant, mirroring how governance grants billing access.
async function grantBillingAdmin(
  workspace: Awaited<
    ReturnType<typeof createPrivateApiMockRequest>
  >["workspace"],
  user: Awaited<ReturnType<typeof createPrivateApiMockRequest>>["user"]
) {
  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  const group = await GroupFactory.regularAuto(
    workspace,
    `billing-admin-${user.sId}`
  );
  await GroupFactory.withMembers(adminAuth, group, [user]);
  await GroupPermissionResource.grantTypeWide(adminAuth, {
    group,
    grantType: "admin",
    resourceType: "billing",
  });
}

describe("POST /api/w/:wId/subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await KillSwitchResource.disableKillSwitch(
      "global_disable_metronome_billing"
    );
  });

  it("returns 400 on invalid request body", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await post(workspace, { invalidField: "invalid" });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("returns hosted checkoutUrl and plan details for legacy subscription when metronome billing is killed", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    await KillSwitchResource.enableKillSwitch(
      "global_disable_metronome_billing"
    );

    const response = await post(workspace, { billingPeriod: "monthly" });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.mode).toEqual("hosted");
    expect(data.checkoutUrl).toEqual(TEST_CHECKOUT_URL);
  });

  it("handles yearly billing period for legacy subscription when metronome billing is killed", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    await KillSwitchResource.enableKillSwitch(
      "global_disable_metronome_billing"
    );

    const response = await post(workspace, { billingPeriod: "yearly" });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.mode).toEqual("hosted");
    expect(data.checkoutUrl).toEqual(TEST_CHECKOUT_URL);
  });

  it("returns embedded clientSecret and sessionId by default", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await post(workspace, {
      billingPeriod: "monthly",
      seatType: "pro",
      targetUserId: user.sId,
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.mode).toEqual("embedded");
    expect(data.clientSecret).toEqual(TEST_CLIENT_SECRET);
    expect(data.sessionId).toEqual(TEST_SESSION_ID);
  });

  it("returns 400 when seat fields are missing while metronome billing is enabled", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await post(workspace, { billingPeriod: "monthly" });

    expect(response.status).toBe(400);
  });

  it("returns hosted checkoutUrl when legacy_billing flag is set even without the kill switch", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    await FeatureFlagFactory.basic(auth, "legacy_billing");

    const response = await post(workspace, { billingPeriod: "monthly" });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.mode).toEqual("hosted");
    expect(data.checkoutUrl).toEqual(TEST_CHECKOUT_URL);
  });

  it("returns 403 when user is not admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const response = await post(workspace, { billingPeriod: "monthly" });

    expect(response.status).toBe(403);
  });

  it("lets a member with the billing admin permission through the auth gate", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    await grantBillingAdmin(workspace, user);

    const response = await post(workspace, { billingPeriod: "monthly" });

    // The caller clears the billing-permission gate: with metronome billing
    // enabled the request now fails on the missing seat fields (400) rather
    // than on authorization.
    expect(response.status).not.toBe(403);
  });
});

describe("PATCH /api/w/:wId/subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for a member without the billing admin permission", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });

    const response = await patch(workspace, { action: "cancel_free_trial" });

    expect(response.status).toBe(403);
  });

  it("lets a member with the billing admin permission through the auth gate", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      method: "PATCH",
      role: "user",
    });

    await grantBillingAdmin(workspace, user);

    const response = await patch(workspace, { action: "cancel_free_trial" });

    // The caller clears the billing-permission gate: the request now fails on the subscription
    // state (not trialing) rather than on authorization.
    expect(response.status).not.toBe(403);
  });
});
