import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { Stripe } from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./index";

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

describe("POST /api/w/[wId]/subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await KillSwitchResource.disableKillSwitch(
      "global_disable_metronome_billing"
    );
  });

  it("returns 400 on invalid request body", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      invalidField: "invalid",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("returns hosted checkoutUrl and plan details for legacy subscription when metronome billing is killed", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    await KillSwitchResource.enableKillSwitch(
      "global_disable_metronome_billing"
    );

    req.body = {
      billingPeriod: "monthly",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.mode).toEqual("hosted");
    expect(data.checkoutUrl).toEqual(TEST_CHECKOUT_URL);
    expect(data.plan).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        name: expect.any(String),
        limits: expect.objectContaining({
          users: expect.objectContaining({
            maxUsers: expect.any(Number),
          }),
          dataSources: expect.any(Object),
        }),
      })
    );
  });

  it("handles yearly billing period for legacy subscription when metronome billing is killed", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    await KillSwitchResource.enableKillSwitch(
      "global_disable_metronome_billing"
    );

    req.body = {
      billingPeriod: "yearly",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.mode).toEqual("hosted");
    expect(data.checkoutUrl).toEqual(TEST_CHECKOUT_URL);
    expect(data.plan).toBeDefined();
  });

  it("returns embedded clientSecret and sessionId by default", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      billingPeriod: "monthly",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.mode).toEqual("embedded");
    expect(data.clientSecret).toEqual(TEST_CLIENT_SECRET);
    expect(data.sessionId).toEqual(TEST_SESSION_ID);
    expect(data.plan).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        name: expect.any(String),
      })
    );
  });

  it("returns embedded clientSecret when metronome_billing flag overrides the kill switch", async () => {
    const { req, res, auth } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    await KillSwitchResource.enableKillSwitch(
      "global_disable_metronome_billing"
    );
    await FeatureFlagFactory.basic(auth, "metronome_billing");

    req.body = {
      billingPeriod: "monthly",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.mode).toEqual("embedded");
    expect(data.clientSecret).toEqual(TEST_CLIENT_SECRET);
    expect(data.sessionId).toEqual(TEST_SESSION_ID);
  });

  it("returns 403 when user is not admin", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    req.body = {
      billingPeriod: "monthly",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });
});
