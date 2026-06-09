import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
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
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    const response = await post(workspace, { billingPeriod: "monthly" });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.mode).toEqual("embedded");
    expect(data.clientSecret).toEqual(TEST_CLIENT_SECRET);
    expect(data.sessionId).toEqual(TEST_SESSION_ID);
  });

  it("returns embedded clientSecret when metronome_billing flag overrides the kill switch", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    await KillSwitchResource.enableKillSwitch(
      "global_disable_metronome_billing"
    );
    await FeatureFlagFactory.basic(auth, "metronome_billing");

    const response = await post(workspace, { billingPeriod: "monthly" });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.mode).toEqual("embedded");
    expect(data.clientSecret).toEqual(TEST_CLIENT_SECRET);
    expect(data.sessionId).toEqual(TEST_SESSION_ID);
  });

  it("returns 403 when user is not admin", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const response = await post(workspace, { billingPeriod: "monthly" });

    expect(response.status).toBe(403);
  });
});
