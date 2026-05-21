import { getStripeCustomer } from "@app/lib/plans/stripe";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/plans/stripe", async () => {
  const actual = await vi.importActual<typeof import("@app/lib/plans/stripe")>(
    "@app/lib/plans/stripe"
  );
  return {
    ...actual,
    getStripeCustomer: vi.fn(),
  };
});

function postCurrency(body: unknown) {
  return honoApp.request("/api/poke/stripe/customers/currency", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/poke/stripe/customers/currency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the resolved currency for a super user", async () => {
    vi.mocked(getStripeCustomer).mockResolvedValue({
      id: "cus_test_eur",
      address: { country: "FR" },
    } as unknown as Stripe.Customer);

    await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });

    const response = await postCurrency({ stripeCustomerId: "cus_test_eur" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ currency: "eur" });
  });

  it("returns 401 when the user is not a super user", async () => {
    await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: false,
    });

    const response = await postCurrency({ stripeCustomerId: "cus_test_usd" });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        type: "not_authenticated",
        message: "The user does not have permission",
      },
    });
  });

  it("returns 400 when stripeCustomerId is missing", async () => {
    await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });

    const response = await postCurrency({ stripeCustomerId: "" });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error.type).toBe("invalid_request_error");
    expect(data.error.message).toContain("Required");
  });

  it("returns 404 when the Stripe customer does not exist", async () => {
    vi.mocked(getStripeCustomer).mockResolvedValue(null);

    await createPrivateApiMockRequest({
      method: "POST",
      isSuperUser: true,
    });

    const response = await postCurrency({ stripeCustomerId: "cus_missing" });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Stripe customer not found: cus_missing.",
      },
    });
  });
});
