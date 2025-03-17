import type { Stripe } from "stripe";
import { beforeEach, describe, expect, vi } from "vitest";

import { upsertProPlans } from "@app/lib/plans/pro_plans";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { itInTransaction } from "@app/tests/utils/utils";

import handler from "./index";

const TEST_CHECKOUT_URL = "https://checkout.stripe.com/test-session";

vi.mock("@app/lib/plans/stripe", async () => {
  return {
    createProPlanCheckoutSession: vi
      .fn()
      .mockResolvedValue("https://checkout.stripe.com/test-session"),
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

  itInTransaction("returns 400 on invalid request body", async () => {
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

  itInTransaction(
    "returns checkoutUrl and plan details for new subscription",
    async () => {
      const { req, res } = await createPrivateApiMockRequest({
        method: "POST",
        role: "admin",
      });

      req.body = {
        billingPeriod: "monthly",
      };

      // Seed plans in the database
      await upsertProPlans();

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
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
    }
  );

  itInTransaction("handles yearly billing period", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      billingPeriod: "yearly",
    };

    // Seed plans in the database
    await upsertProPlans();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.checkoutUrl).toEqual(TEST_CHECKOUT_URL);
    expect(data.plan).toBeDefined();
  });

  itInTransaction("throws error when plan not found", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "admin",
    });

    req.body = {
      billingPeriod: "yearly",
    };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
  });

  itInTransaction("returns 403 when user is not admin", async () => {
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
