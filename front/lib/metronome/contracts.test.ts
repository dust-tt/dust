import type { EnterprisePricingCents } from "@app/lib/metronome/contracts";
import {
  buildEnterpriseOverrides,
  extractEnterprisePricing,
  provisionMetronomeCustomerAndContract,
  switchMetronomeContractPackage,
} from "@app/lib/metronome/contracts";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockCreateMetronomeContract,
  mockCreateMetronomeCustomer,
  mockFindMetronomeCustomerByAlias,
  mockGetMetronomeContractById,
  mockGetSeatSubscriptionIdFromContract,
  mockHasMauSubscriptionInContract,
  mockPrices,
  mockScheduleMetronomeContractEnd,
  mockSyncMauCount,
  mockSyncSeatCount,
} = vi.hoisted(() => {
  const mockPrices = { retrieve: vi.fn() };

  return {
    mockCreateMetronomeContract: vi.fn(),
    mockCreateMetronomeCustomer: vi.fn(),
    mockFindMetronomeCustomerByAlias: vi.fn(),
    mockGetMetronomeContractById: vi.fn(),
    mockGetSeatSubscriptionIdFromContract: vi.fn(),
    mockHasMauSubscriptionInContract: vi.fn(),
    mockPrices,
    mockScheduleMetronomeContractEnd: vi.fn(),
    mockSyncMauCount: vi.fn(),
    mockSyncSeatCount: vi.fn(),
  };
});

vi.mock("@app/lib/metronome/client", () => ({
  ceilToHourISO: (date: Date) => date.toISOString(),
  createMetronomeContract: mockCreateMetronomeContract,
  createMetronomeCustomer: mockCreateMetronomeCustomer,
  epochSecondsToFloorHourISO: vi.fn(),
  findMetronomeCustomerByAlias: mockFindMetronomeCustomerByAlias,
  getMetronomeClient: vi.fn(),
  getMetronomeContractById: mockGetMetronomeContractById,
  scheduleMetronomeContractEnd: mockScheduleMetronomeContractEnd,
}));

vi.mock("@app/lib/metronome/mau_sync", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/mau_sync")
  >("@app/lib/metronome/mau_sync");

  return {
    ...actual,
    hasMauSubscriptionInContract: mockHasMauSubscriptionInContract,
    syncMauCount: mockSyncMauCount,
  };
});

vi.mock("@app/lib/metronome/seats", () => ({
  getSeatSubscriptionIdFromContract: mockGetSeatSubscriptionIdFromContract,
  syncSeatCount: mockSyncSeatCount,
}));

vi.mock("@app/lib/plans/stripe", () => ({
  getStripeClient: () => ({ prices: mockPrices }),
}));

vi.mock("@app/lib/metronome/constants", () => ({
  CURRENCY_TO_CREDIT_TYPE_ID: {
    usd: "usd-credit-type",
    eur: "eur-credit-type",
  },
  MAX_MAU_TIERS: 6,
  getProductMauId: () => "mau-product",
  getProductMauCommitId: () => "mau-commit-product",
  getProductMauTierIds: () => [
    "tier1-product",
    "tier2-product",
    "tier3-product",
    "tier4-product",
    "tier5-product",
    "tier6-product",
  ],
}));

const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as any;

const WORKSPACE = {
  id: 42,
  sId: "w_123",
  name: "Workspace",
} as LightWorkspaceType;

const CONTRACT = {
  id: "m-contract",
  subscriptions: [],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(START_DATE));

  mockPrices.retrieve.mockReset();

  mockFindMetronomeCustomerByAlias.mockReset();
  mockFindMetronomeCustomerByAlias.mockResolvedValue(new Ok("m-customer"));

  mockCreateMetronomeCustomer.mockReset();
  mockCreateMetronomeCustomer.mockResolvedValue(
    new Ok({ metronomeCustomerId: "m-customer" })
  );

  mockCreateMetronomeContract.mockReset();
  mockCreateMetronomeContract.mockResolvedValue(
    new Ok({ contractId: "m-contract" })
  );

  mockScheduleMetronomeContractEnd.mockReset();
  mockScheduleMetronomeContractEnd.mockResolvedValue(new Ok(undefined));

  mockGetMetronomeContractById.mockReset();
  mockGetMetronomeContractById.mockResolvedValue(new Ok(CONTRACT));

  mockGetSeatSubscriptionIdFromContract.mockReset();
  mockGetSeatSubscriptionIdFromContract.mockReturnValue("seat-subscription");

  mockHasMauSubscriptionInContract.mockReset();
  mockHasMauSubscriptionInContract.mockReturnValue(true);

  mockSyncSeatCount.mockReset();
  mockSyncSeatCount.mockResolvedValue(new Ok(undefined));

  mockSyncMauCount.mockReset();
  mockSyncMauCount.mockResolvedValue(new Ok(undefined));
});

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

/** Find an override by product_id (may be in override_specifiers or top-level). */
function findOverride(
  overrides: ReturnType<typeof buildEnterpriseOverrides>["overrides"],
  productId: string
) {
  return overrides.find(
    (o) =>
      o.product_id === productId ||
      o.override_specifiers?.some((s) => s.product_id === productId)
  );
}

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
  it("FIXED: disables all MAU and tier products", () => {
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "FIXED",
      tiers: [],
      floorCents: 500000,
    };

    const result = buildEnterpriseOverrides({
      pricing,
      startDate: START_DATE,
      initialMauCount: 0,
    });

    // 1 MAU + 6 tier products = 7 disabled.
    expect(result.overrides).toHaveLength(7);
    for (const o of result.overrides) {
      expect(o.entitled).toBe(false);
    }
    expect(result.recurring_commits).toBeUndefined();
    expect(result.custom_fields).toBeUndefined();
  });

  it("Pattern A: floor + overage, same price → simple mode", () => {
    // derived = 450000/100 = 4500, overage = 4500 → all same price → simple mode
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [
        { upTo: 100, unitAmountCents: 0, flatAmountCents: 450000 },
        { upTo: undefined, unitAmountCents: 4500, flatAmountCents: 0 },
      ],
      floorCents: 450000,
    };

    const result = buildEnterpriseOverrides({
      pricing,
      startDate: START_DATE,
      initialMauCount: 0,
    });

    // Simple mode: MAU product enabled.
    const mauOverride = findOverride(result.overrides, "mau-product");
    expect(mauOverride?.entitled).toBe(true);
    expect(mauOverride?.overwrite_rate.price).toBe(4500);

    // All tier products disabled.
    expect(findOverride(result.overrides, "tier1-product")?.entitled).toBe(
      false
    );

    // MAU subscription added.
    expect(result.add_subscriptions).toHaveLength(1);

    // Recurring commit for the floor.
    expect(result.recurring_commits).toHaveLength(1);
    expect(result.recurring_commits![0].access_amount.unit_price).toBe(450000);
    expect(result.recurring_commits![0].applicable_product_ids).toEqual([
      "mau-product",
    ]);

    // No MAU_TIERS (simple mode), only MAU_THRESHOLD.
    expect(result.custom_fields).toEqual({
      MAU_THRESHOLD: "1",
    });
  });

  it("Pattern B: no floor, free included seats", () => {
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [
        { upTo: 100, unitAmountCents: 0, flatAmountCents: 0 },
        { upTo: undefined, unitAmountCents: 4500, flatAmountCents: 0 },
      ],
      floorCents: 0,
    };

    const result = buildEnterpriseOverrides({
      pricing,
      startDate: START_DATE,
      initialMauCount: 0,
    });

    const tier1 = findOverride(result.overrides, "tier1-product");
    expect(tier1?.overwrite_rate.price).toBe(0);

    const tier2 = findOverride(result.overrides, "tier2-product");
    expect(tier2?.overwrite_rate.price).toBe(4500);

    expect(result.recurring_commits).toBeUndefined();
    expect(result.custom_fields?.MAU_TIERS).toBe("1-101");
  });

  it("Pattern C: no floor, paid from first seat", () => {
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [
        { upTo: 120, unitAmountCents: 4000, flatAmountCents: 0 },
        { upTo: undefined, unitAmountCents: 4500, flatAmountCents: 0 },
      ],
      floorCents: 0,
    };

    const result = buildEnterpriseOverrides({
      pricing,
      startDate: START_DATE,
      initialMauCount: 0,
    });

    const tier1 = findOverride(result.overrides, "tier1-product");
    expect(tier1?.overwrite_rate.price).toBe(4000);

    const tier2 = findOverride(result.overrides, "tier2-product");
    expect(tier2?.overwrite_rate.price).toBe(4500);

    expect(result.recurring_commits).toBeUndefined();
    expect(result.custom_fields?.MAU_TIERS).toBe("1-121");
  });

  it("Pattern D: multi-tier (5 tiers)", () => {
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

    const result = buildEnterpriseOverrides({
      pricing,
      startDate: START_DATE,
      initialMauCount: 0,
    });

    // 5 tier products enabled with correct prices.
    const enabledTiers = result.overrides.filter((o) => o.entitled);
    expect(enabledTiers).toHaveLength(5);
    expect(enabledTiers.map((o) => o.overwrite_rate.price)).toEqual([
      4500, // 315000/70
      4500,
      4200,
      4000,
      3700,
    ]);

    // Tier 6 disabled.
    const tier6 = findOverride(result.overrides, "tier6-product");
    expect(tier6?.entitled).toBe(false);

    expect(result.recurring_commits).toHaveLength(1);
    expect(result.recurring_commits![0].access_amount.unit_price).toBe(315000);
    expect(result.custom_fields?.MAU_TIERS).toBe("FLOOR-71-101-201-501");
  });

  it("Pattern E: single-tier flat rate", () => {
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "MAU_1",
      tiers: [{ upTo: undefined, unitAmountCents: 2000, flatAmountCents: 0 }],
      floorCents: 0,
    };

    const result = buildEnterpriseOverrides({
      pricing,
      startDate: START_DATE,
      initialMauCount: 0,
    });

    // Single tier → simple mode: MAU product enabled.
    const mauOverride = findOverride(result.overrides, "mau-product");
    expect(mauOverride?.entitled).toBe(true);
    expect(mauOverride?.overwrite_rate.price).toBe(2000);

    // Tier products disabled.
    expect(findOverride(result.overrides, "tier1-product")?.entitled).toBe(
      false
    );

    expect(result.recurring_commits).toBeUndefined();
    expect(result.custom_fields?.MAU_TIERS).toBeUndefined();
  });

  it("MAU_5: sets MAU_THRESHOLD to 5 (simple mode)", () => {
    // derived = 225000/50 = 4500, overage = 4500 → same price → simple mode
    const pricing: EnterprisePricingCents = {
      currency: "usd",
      billingMode: "MAU_5",
      tiers: [
        { upTo: 50, unitAmountCents: 0, flatAmountCents: 225000 },
        { upTo: undefined, unitAmountCents: 4500, flatAmountCents: 0 },
      ],
      floorCents: 225000,
    };

    const result = buildEnterpriseOverrides({
      pricing,
      startDate: START_DATE,
      initialMauCount: 0,
    });

    // Simple mode: MAU product enabled (same price across tiers).
    expect(findOverride(result.overrides, "mau-product")?.entitled).toBe(true);

    // Tier products disabled.
    expect(findOverride(result.overrides, "tier1-product")?.entitled).toBe(
      false
    );

    expect(result.custom_fields?.MAU_THRESHOLD).toBe("5");
  });

  it("EUR currency uses EUR credit type and converts to euros", () => {
    // 120000 cents / 30 = 4000 cents = 40 EUR. Overage 4000 cents = 40 EUR. Same → simple mode.
    const pricing: EnterprisePricingCents = {
      currency: "eur",
      billingMode: "MAU_1",
      tiers: [
        { upTo: 30, unitAmountCents: 0, flatAmountCents: 120000 },
        { upTo: undefined, unitAmountCents: 4000, flatAmountCents: 0 },
      ],
      floorCents: 120000,
    };

    const result = buildEnterpriseOverrides({
      pricing,
      startDate: START_DATE,
      initialMauCount: 0,
    });

    // Simple mode: MAU product with EUR credit type and price in euros.
    const mauOverride = findOverride(result.overrides, "mau-product");
    expect(mauOverride?.overwrite_rate.credit_type_id).toBe("eur-credit-type");
    expect(mauOverride?.overwrite_rate.price).toBe(40); // 4000 cents → 40 EUR

    // Commit in euros.
    expect(result.recurring_commits![0].access_amount.credit_type_id).toBe(
      "eur-credit-type"
    );
    expect(result.recurring_commits![0].access_amount.unit_price).toBe(1200); // 120000 cents → 1200 EUR
  });

  it("3-tier with floor: floor + 2 overage tiers", () => {
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

    const result = buildEnterpriseOverrides({
      pricing,
      startDate: START_DATE,
      initialMauCount: 0,
    });

    const tier1 = findOverride(result.overrides, "tier1-product");
    expect(tier1?.overwrite_rate.price).toBe(3250); // 325000 / 100

    const tier2 = findOverride(result.overrides, "tier2-product");
    expect(tier2?.overwrite_rate.price).toBe(3000);

    const tier3 = findOverride(result.overrides, "tier3-product");
    expect(tier3?.overwrite_rate.price).toBe(2500);

    expect(result.recurring_commits![0].access_amount.unit_price).toBe(325000);
    expect(result.custom_fields?.MAU_TIERS).toBe("FLOOR-101-201");
  });
});

// ---------------------------------------------------------------------------
// Contract provisioning / switching
// ---------------------------------------------------------------------------

describe("provisionMetronomeCustomerAndContract", () => {
  it("syncs seats and MAU when the contract has both subscriptions", async () => {
    const result = await provisionMetronomeCustomerAndContract({
      workspace: WORKSPACE,
      stripeCustomerId: "stripe-customer",
      packageAlias: "legacy-pro-monthly",
      uniquenessKey: "uniq_123",
      startingAt: new Date(START_DATE),
    });

    expect(result.isOk()).toBe(true);
    expect(mockGetMetronomeContractById).toHaveBeenCalledWith({
      metronomeCustomerId: "m-customer",
      metronomeContractId: "m-contract",
    });
    expect(mockGetSeatSubscriptionIdFromContract).toHaveBeenCalledWith(
      CONTRACT
    );
    expect(mockHasMauSubscriptionInContract).toHaveBeenCalledWith(CONTRACT);
    expect(mockSyncSeatCount).toHaveBeenCalledTimes(1);
    expect(mockSyncSeatCount).toHaveBeenCalledWith({
      metronomeCustomerId: "m-customer",
      contractId: "m-contract",
      workspace: WORKSPACE,
      startingAt: START_DATE,
      contract: CONTRACT,
    });
    expect(mockSyncMauCount).toHaveBeenCalledTimes(1);
    expect(mockSyncMauCount).toHaveBeenCalledWith({
      metronomeCustomerId: "m-customer",
      contractId: "m-contract",
      workspace: WORKSPACE,
      startingAt: START_DATE,
      contract: CONTRACT,
    });
  });

  it("skips seat sync when the contract has no seat subscription", async () => {
    mockGetSeatSubscriptionIdFromContract.mockReturnValue(undefined);

    const result = await provisionMetronomeCustomerAndContract({
      workspace: WORKSPACE,
      stripeCustomerId: "stripe-customer",
      packageAlias: "legacy-enterprise",
      uniquenessKey: "uniq_123",
      startingAt: new Date(START_DATE),
    });

    expect(result.isOk()).toBe(true);
    expect(mockSyncSeatCount).not.toHaveBeenCalled();
    expect(mockSyncMauCount).toHaveBeenCalledTimes(1);
  });

  it("skips MAU sync when the contract has no MAU subscription", async () => {
    mockHasMauSubscriptionInContract.mockReturnValue(false);

    const result = await provisionMetronomeCustomerAndContract({
      workspace: WORKSPACE,
      stripeCustomerId: "stripe-customer",
      packageAlias: "legacy-pro-monthly",
      uniquenessKey: "uniq_123",
      startingAt: new Date(START_DATE),
    });

    expect(result.isOk()).toBe(true);
    expect(mockSyncSeatCount).toHaveBeenCalledTimes(1);
    expect(mockSyncMauCount).not.toHaveBeenCalled();
  });
});

describe("switchMetronomeContractPackage", () => {
  it("syncs seats and MAU when the contract has both subscriptions", async () => {
    const result = await switchMetronomeContractPackage({
      metronomeCustomerId: "m-customer",
      oldContractId: "old-contract",
      workspace: WORKSPACE,
      packageAlias: "legacy-business",
    });

    expect(result.isOk()).toBe(true);
    expect(mockScheduleMetronomeContractEnd).toHaveBeenCalledTimes(1);
    expect(mockSyncSeatCount).toHaveBeenCalledTimes(1);
    expect(mockSyncSeatCount).toHaveBeenCalledWith({
      metronomeCustomerId: "m-customer",
      contractId: "m-contract",
      workspace: WORKSPACE,
      startingAt: START_DATE,
      contract: CONTRACT,
    });
    expect(mockSyncMauCount).toHaveBeenCalledTimes(1);
  });

  it("skips seat sync when the switched contract has no seat subscription", async () => {
    mockGetSeatSubscriptionIdFromContract.mockReturnValue(undefined);

    const result = await switchMetronomeContractPackage({
      metronomeCustomerId: "m-customer",
      oldContractId: "old-contract",
      workspace: WORKSPACE,
      packageAlias: "legacy-enterprise-eur",
    });

    expect(result.isOk()).toBe(true);
    expect(mockSyncSeatCount).not.toHaveBeenCalled();
    expect(mockSyncMauCount).toHaveBeenCalledTimes(1);
  });

  it("skips MAU sync when the switched contract has no MAU subscription", async () => {
    mockHasMauSubscriptionInContract.mockReturnValue(false);

    const result = await switchMetronomeContractPackage({
      metronomeCustomerId: "m-customer",
      oldContractId: "old-contract",
      workspace: WORKSPACE,
      packageAlias: "legacy-business",
    });

    expect(result.isOk()).toBe(true);
    expect(mockSyncSeatCount).toHaveBeenCalledTimes(1);
    expect(mockSyncMauCount).not.toHaveBeenCalled();
  });
});
