import type { EnterprisePricingCents } from "@app/lib/metronome/contracts";
import {
  buildEnterpriseOverrides,
  extractEnterprisePricing,
} from "@app/lib/metronome/contracts";
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockPrices } = vi.hoisted(() => {
  const mockPrices = { retrieve: vi.fn() };
  return { mockPrices };
});

vi.mock("@app/lib/plans/stripe", () => ({
  getStripeClient: () => ({ prices: mockPrices }),
}));

vi.mock("@app/lib/metronome/constants", () => ({
  CURRENCY_TO_CREDIT_TYPE_ID: {
    usd: "usd-credit-type",
    eur: "eur-credit-type",
  },
  getProductWorkspaceMau1Id: () => "mau1-product",
  getProductWorkspaceMau5Id: () => "mau5-product",
  getProductWorkspaceMau10Id: () => "mau10-product",
  getProductPrepaidCommitId: () => "prepaid-commit-product",
}));

const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as any;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSubscription(
  items: Array<{
    priceId: string;
    currency: string;
    metadata?: Record<string, string>;
    unitAmount?: number | null;
  }>
): Stripe.Subscription {
  return {
    items: {
      data: items.map((item) => ({
        price: {
          id: item.priceId,
          currency: item.currency,
          metadata: item.metadata ?? {},
          unit_amount: item.unitAmount ?? null,
        },
      })),
    },
  } as unknown as Stripe.Subscription;
}

const START_DATE = "2026-04-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// extractEnterprisePricing
// ---------------------------------------------------------------------------

describe("extractEnterprisePricing", () => {
  it("extracts FIXED pricing", async () => {
    const sub = makeSubscription([
      {
        priceId: "price_fixed",
        currency: "usd",
        metadata: { REPORT_USAGE: "FIXED" },
        unitAmount: 500000,
      },
    ]);

    const result = await extractEnterprisePricing(sub, noopLogger);

    expect(result).toEqual({
      currency: "usd",
      billingMode: "FIXED",
      tiers: [],
      floorCents: 500000,
    });
  });

  it("extracts 2-tier MAU pricing (floor + overage)", async () => {
    const sub = makeSubscription([
      {
        priceId: "price_mau",
        currency: "usd",
        metadata: { REPORT_USAGE: "MAU_1" },
      },
    ]);
    mockPrices.retrieve.mockResolvedValue({
      currency: "usd",
      tiers: [
        { up_to: 100, unit_amount: 0, flat_amount: 450000 },
        { up_to: null, unit_amount: 4500, flat_amount: null },
      ],
    });

    const result = await extractEnterprisePricing(sub, noopLogger);

    expect(result).toEqual({
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [
        { upTo: 100, unitAmountCents: 0, flatAmountCents: 450000 },
        { upTo: undefined, unitAmountCents: 4500, flatAmountCents: 0 },
      ],
      floorCents: 450000,
    });
  });

  it("extracts multi-tier MAU pricing (5 tiers)", async () => {
    const sub = makeSubscription([
      {
        priceId: "price_mau_multi",
        currency: "usd",
        metadata: { REPORT_USAGE: "MAU_1" },
      },
    ]);
    mockPrices.retrieve.mockResolvedValue({
      currency: "usd",
      tiers: [
        { up_to: 70, unit_amount: null, flat_amount: 315000 },
        { up_to: 100, unit_amount: 4500, flat_amount: null },
        { up_to: 200, unit_amount: 4200, flat_amount: null },
        { up_to: 500, unit_amount: 4000, flat_amount: null },
        { up_to: null, unit_amount: 3700, flat_amount: null },
      ],
    });

    const result = await extractEnterprisePricing(sub, noopLogger);

    expect(result).toEqual({
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [
        { upTo: 70, unitAmountCents: 0, flatAmountCents: 315000 },
        { upTo: 100, unitAmountCents: 4500, flatAmountCents: 0 },
        { upTo: 200, unitAmountCents: 4200, flatAmountCents: 0 },
        { upTo: 500, unitAmountCents: 4000, flatAmountCents: 0 },
        { upTo: undefined, unitAmountCents: 3700, flatAmountCents: 0 },
      ],
      floorCents: 315000,
    });
  });

  it("extracts single-tier MAU pricing (flat rate)", async () => {
    const sub = makeSubscription([
      {
        priceId: "price_single",
        currency: "usd",
        metadata: { REPORT_USAGE: "MAU_1" },
      },
    ]);
    mockPrices.retrieve.mockResolvedValue({
      currency: "usd",
      tiers: [{ up_to: null, unit_amount: 2000, flat_amount: null }],
    });

    const result = await extractEnterprisePricing(sub, noopLogger);

    expect(result).toEqual({
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [{ upTo: undefined, unitAmountCents: 2000, flatAmountCents: 0 }],
      floorCents: 0,
    });
  });

  it("extracts no-floor pricing (free included seats)", async () => {
    const sub = makeSubscription([
      {
        priceId: "price_no_floor",
        currency: "usd",
        metadata: { REPORT_USAGE: "MAU_1" },
      },
    ]);
    mockPrices.retrieve.mockResolvedValue({
      currency: "usd",
      tiers: [
        { up_to: 100, unit_amount: 0, flat_amount: 0 },
        { up_to: null, unit_amount: 4500, flat_amount: null },
      ],
    });

    const result = await extractEnterprisePricing(sub, noopLogger);

    expect(result).toEqual({
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [
        { upTo: 100, unitAmountCents: 0, flatAmountCents: 0 },
        { upTo: undefined, unitAmountCents: 4500, flatAmountCents: 0 },
      ],
      floorCents: 0,
    });
  });

  it("extracts MAU_5 billing mode", async () => {
    const sub = makeSubscription([
      {
        priceId: "price_mau5",
        currency: "eur",
        metadata: { REPORT_USAGE: "MAU_5" },
      },
    ]);
    mockPrices.retrieve.mockResolvedValue({
      currency: "eur",
      tiers: [
        { up_to: 50, unit_amount: 0, flat_amount: 225000 },
        { up_to: null, unit_amount: 4500, flat_amount: null },
      ],
    });

    const result = await extractEnterprisePricing(sub, noopLogger);

    expect(result?.billingMode).toBe("MAU_5");
    expect(result?.currency).toBe("eur");
  });

  it("returns undefined when no enterprise pricing item found", async () => {
    const sub = makeSubscription([
      {
        priceId: "price_pro",
        currency: "usd",
        metadata: { REPORT_USAGE: "PER_SEAT" },
      },
    ]);

    const result = await extractEnterprisePricing(sub, noopLogger);

    expect(result).toBeUndefined();
  });

  it("returns undefined when tiers are empty", async () => {
    const sub = makeSubscription([
      {
        priceId: "price_empty",
        currency: "usd",
        metadata: { REPORT_USAGE: "MAU_1" },
      },
    ]);
    mockPrices.retrieve.mockResolvedValue({
      currency: "usd",
      tiers: [],
    });

    const result = await extractEnterprisePricing(sub, noopLogger);

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// buildEnterpriseOverrides
// ---------------------------------------------------------------------------

describe("buildEnterpriseOverrides", () => {
  it("FIXED: disables all MAU products", () => {
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "FIXED",
      tiers: [],
      floorCents: 500000,
    };

    const result = buildEnterpriseOverrides({ pricing, startDate: START_DATE });

    expect(result.overrides).toHaveLength(3);
    expect(result.overrides.map((o) => o.product_id)).toEqual([
      "mau1-product",
      "mau5-product",
      "mau10-product",
    ]);
    for (const o of result.overrides) {
      expect(o.entitled).toBe(false);
      expect(o.overwrite_rate.rate_type).toBe("FLAT");
      expect(o.overwrite_rate.price).toBe(0);
    }
    expect(result.recurring_commits).toBeUndefined();
  });

  it("Pattern A: floor + overage (2-tier)", () => {
    // Stripe: [{flat: 450000, unit: 0, up_to: 100}, {unit: 4500, up_to: null}]
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [
        { upTo: 100, unitAmountCents: 0, flatAmountCents: 450000 },
        { upTo: undefined, unitAmountCents: 4500, flatAmountCents: 0 },
      ],
      floorCents: 450000,
    };

    const result = buildEnterpriseOverrides({ pricing, startDate: START_DATE });

    // Single override: tiered rate on MAU_1 product.
    const mauOverride = result.overrides.find(
      (o) => o.product_id === "mau1-product"
    );
    expect(mauOverride?.entitled).toBe(true);
    expect(mauOverride?.overwrite_rate.rate_type).toBe("TIERED");
    expect(mauOverride?.overwrite_rate.tiers).toEqual([
      { price: 4500, size: 100 }, // 450000 / 100 = 4500
      { price: 4500 },
    ]);

    // Recurring commit for the floor.
    expect(result.recurring_commits).toHaveLength(1);
    expect(result.recurring_commits![0].access_amount.unit_price).toBe(450000);
  });

  it("Pattern B: no floor, free included seats", () => {
    // Stripe: [{flat: 0, unit: 0, up_to: 100}, {unit: 4500, up_to: null}]
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [
        { upTo: 100, unitAmountCents: 0, flatAmountCents: 0 },
        { upTo: undefined, unitAmountCents: 4500, flatAmountCents: 0 },
      ],
      floorCents: 0,
    };

    const result = buildEnterpriseOverrides({ pricing, startDate: START_DATE });

    const mauOverride = result.overrides.find(
      (o) => o.product_id === "mau1-product"
    );
    expect(mauOverride?.overwrite_rate.tiers).toEqual([
      { price: 0, size: 100 },
      { price: 4500 },
    ]);
    // No floor → no recurring commit.
    expect(result.recurring_commits).toBeUndefined();
  });

  it("Pattern C: no floor, paid from first seat", () => {
    // Stripe: [{flat: null, unit: 4000, up_to: 120}, {unit: 4500, up_to: null}]
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [
        { upTo: 120, unitAmountCents: 4000, flatAmountCents: 0 },
        { upTo: undefined, unitAmountCents: 4500, flatAmountCents: 0 },
      ],
      floorCents: 0,
    };

    const result = buildEnterpriseOverrides({ pricing, startDate: START_DATE });

    const mauOverride = result.overrides.find(
      (o) => o.product_id === "mau1-product"
    );
    expect(mauOverride?.overwrite_rate.tiers).toEqual([
      { price: 4000, size: 120 },
      { price: 4500 },
    ]);
    expect(result.recurring_commits).toBeUndefined();
  });

  it("Pattern D: multi-tier (5 tiers)", () => {
    // Stripe: [{flat: 315000, up_to: 70}, {unit: 4500, up_to: 100}, {unit: 4200, up_to: 200},
    //          {unit: 4000, up_to: 500}, {unit: 3700, up_to: null}]
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [
        { upTo: 70, unitAmountCents: 0, flatAmountCents: 315000 },
        { upTo: 100, unitAmountCents: 4500, flatAmountCents: 0 },
        { upTo: 200, unitAmountCents: 4200, flatAmountCents: 0 },
        { upTo: 500, unitAmountCents: 4000, flatAmountCents: 0 },
        { upTo: undefined, unitAmountCents: 3700, flatAmountCents: 0 },
      ],
      floorCents: 315000,
    };

    const result = buildEnterpriseOverrides({ pricing, startDate: START_DATE });

    const mauOverride = result.overrides.find(
      (o) => o.product_id === "mau1-product"
    );
    expect(mauOverride?.overwrite_rate.tiers).toEqual([
      { price: 4500, size: 70 }, // 315000 / 70 = 4500
      { price: 4500, size: 30 }, // 100 - 70
      { price: 4200, size: 100 }, // 200 - 100
      { price: 4000, size: 300 }, // 500 - 200
      { price: 3700 },
    ]);

    expect(result.recurring_commits).toHaveLength(1);
    expect(result.recurring_commits![0].access_amount.unit_price).toBe(315000);
  });

  it("Pattern E: single-tier flat rate", () => {
    // Stripe: [{unit: 2000, up_to: null}]
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [{ upTo: undefined, unitAmountCents: 2000, flatAmountCents: 0 }],
      floorCents: 0,
    };

    const result = buildEnterpriseOverrides({ pricing, startDate: START_DATE });

    const mauOverride = result.overrides.find(
      (o) => o.product_id === "mau1-product"
    );
    expect(mauOverride?.overwrite_rate.tiers).toEqual([{ price: 2000 }]);
    expect(result.recurring_commits).toBeUndefined();
  });

  it("MAU_5: disables MAU_1 and enables MAU_5", () => {
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "MAU_5",
      tiers: [
        { upTo: 50, unitAmountCents: 0, flatAmountCents: 225000 },
        { upTo: undefined, unitAmountCents: 4500, flatAmountCents: 0 },
      ],
      floorCents: 225000,
    };

    const result = buildEnterpriseOverrides({ pricing, startDate: START_DATE });

    // MAU_1 disabled.
    const mau1Override = result.overrides.find(
      (o) => o.product_id === "mau1-product"
    );
    expect(mau1Override?.entitled).toBe(false);

    // MAU_5 enabled with tiered rate.
    const mau5Override = result.overrides.find(
      (o) => o.product_id === "mau5-product"
    );
    expect(mau5Override?.entitled).toBe(true);
    expect(mau5Override?.overwrite_rate.rate_type).toBe("TIERED");
  });

  it("MAU_10: disables MAU_1 and enables MAU_10", () => {
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "MAU_10",
      tiers: [
        { upTo: 30, unitAmountCents: 0, flatAmountCents: 135000 },
        { upTo: undefined, unitAmountCents: 4500, flatAmountCents: 0 },
      ],
      floorCents: 135000,
    };

    const result = buildEnterpriseOverrides({ pricing, startDate: START_DATE });

    const mau1Override = result.overrides.find(
      (o) => o.product_id === "mau1-product"
    );
    expect(mau1Override?.entitled).toBe(false);

    const mau10Override = result.overrides.find(
      (o) => o.product_id === "mau10-product"
    );
    expect(mau10Override?.entitled).toBe(true);
  });

  it("EUR currency uses EUR credit type", () => {
    const pricing: EnterprisePricingCents = {
      currency: "eur",
      billingMode: "MAU_1",
      tiers: [
        { upTo: 30, unitAmountCents: 0, flatAmountCents: 120000 },
        { upTo: undefined, unitAmountCents: 4000, flatAmountCents: 0 },
      ],
      floorCents: 120000,
    };

    const result = buildEnterpriseOverrides({ pricing, startDate: START_DATE });

    const mauOverride = result.overrides.find(
      (o) => o.product_id === "mau1-product"
    );
    expect(mauOverride?.overwrite_rate.credit_type_id).toBe("eur-credit-type");
    expect(result.recurring_commits![0].access_amount.credit_type_id).toBe(
      "eur-credit-type"
    );
  });

  it("3-tier with floor: floor + 2 overage tiers", () => {
    // Stripe: [{flat: 325000, unit: 0, up_to: 100}, {unit: 3000, up_to: 200}, {unit: 2500, up_to: null}]
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [
        { upTo: 100, unitAmountCents: 0, flatAmountCents: 325000 },
        { upTo: 200, unitAmountCents: 3000, flatAmountCents: 0 },
        { upTo: undefined, unitAmountCents: 2500, flatAmountCents: 0 },
      ],
      floorCents: 325000,
    };

    const result = buildEnterpriseOverrides({ pricing, startDate: START_DATE });

    const mauOverride = result.overrides.find(
      (o) => o.product_id === "mau1-product"
    );
    expect(mauOverride?.overwrite_rate.tiers).toEqual([
      { price: 3250, size: 100 }, // 325000 / 100
      { price: 3000, size: 100 }, // 200 - 100
      { price: 2500 },
    ]);

    expect(result.recurring_commits![0].access_amount.unit_price).toBe(325000);
  });
});
