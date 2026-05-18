import { resolveCurrencyFromStripe } from "@app/lib/plans/billing_currency";
import { describe, expect, it } from "vitest";

const sub = (currency: string) => ({ currency });

const customer = (
  fields: Partial<{ currency: string | null; country: string | null }>
) => ({
  currency: fields.currency ?? null,
  address: fields.country ? { country: fields.country } : null,
});

describe("resolveCurrencyFromStripe", () => {
  it("returns the Stripe subscription currency when set and supported", () => {
    expect(resolveCurrencyFromStripe({ stripeSubscription: sub("eur") })).toBe(
      "eur"
    );
    expect(resolveCurrencyFromStripe({ stripeSubscription: sub("usd") })).toBe(
      "usd"
    );
  });

  it("falls through to customer when subscription currency is unsupported", () => {
    expect(
      resolveCurrencyFromStripe({
        stripeSubscription: sub("gbp"),
        stripeCustomer: customer({ currency: "eur" }),
      })
    ).toBe("eur");
  });

  it("uses the Stripe customer currency when no subscription is provided", () => {
    expect(
      resolveCurrencyFromStripe({
        stripeCustomer: customer({ currency: "eur" }),
      })
    ).toBe("eur");
  });

  it("prefers the customer's address country over countryFallback", () => {
    expect(
      resolveCurrencyFromStripe({
        stripeCustomer: customer({ country: "US" }),
        countryFallback: "FR",
      })
    ).toBe("usd");
  });

  it("uses countryFallback when the customer has no address", () => {
    expect(
      resolveCurrencyFromStripe({
        stripeCustomer: customer({}),
        countryFallback: "FR",
      })
    ).toBe("eur");
  });

  it("falls back to the customer's address country when no other signal", () => {
    expect(
      resolveCurrencyFromStripe({ stripeCustomer: customer({ country: "FR" }) })
    ).toBe("eur");
    expect(
      resolveCurrencyFromStripe({ stripeCustomer: customer({ country: "US" }) })
    ).toBe("usd");
  });

  it("defaults to usd when nothing is provided", () => {
    expect(resolveCurrencyFromStripe({})).toBe("usd");
  });

  it("ignores null customer and uses countryFallback", () => {
    expect(
      resolveCurrencyFromStripe({
        stripeCustomer: null,
        countryFallback: "FR",
      })
    ).toBe("eur");
  });
});
