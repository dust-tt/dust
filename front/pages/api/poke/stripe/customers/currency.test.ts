import { getStripeCustomer } from "@app/lib/plans/stripe";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./currency";

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual<typeof import("@app/lib/plans/stripe")>(
    "@app/lib/plans/stripe"
  );
  return {
    ...actual,
    getStripeCustomer: vi.fn(),
  };
});

describe("POST /api/poke/stripe/customers/currency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the resolved currency for a super user", async () => {
    vi.mocked(getStripeCustomer).mockResolvedValue({
      id: "cus_test_eur",
      address: { country: "FR" },
    } as unknown as Stripe.Customer);

    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    req.body = { stripeCustomerId: "cus_test_eur" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ currency: "eur" });
  });

  it("returns 401 when the user is not a super user", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: false,
    });
    req.body = { stripeCustomerId: "cus_test_usd" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "not_authenticated",
        message: "The user does not have permission",
      },
    });
  });

  it("only supports POST", async () => {
    for (const method of ["DELETE", "GET", "PUT", "PATCH"] as const) {
      const { req, res } = await createPrivateApiMockRequest({
        method,
        isSuperUser: true,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
    }
  });

  it("returns 400 when stripeCustomerId is missing", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    req.body = { stripeCustomerId: "" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
    expect(res._getJSONData().error.message).toContain("Required");
  });

  it("returns 404 when the Stripe customer does not exist", async () => {
    vi.mocked(getStripeCustomer).mockResolvedValue(null);

    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });
    req.body = { stripeCustomerId: "cus_missing" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Stripe customer not found: cus_missing.",
      },
    });
  });
});
