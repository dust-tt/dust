import type { CachedContract } from "@app/lib/metronome/plan_type";
import {
  hasContractSeatSubscription,
  resolveRemappedSeatType,
} from "@app/lib/metronome/seats";
import type { MembershipSeatType } from "@app/types/memberships";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", () => ({
  getMetronomeContractById: vi.fn(),
  updateSubscriptionQuantity: vi.fn(),
}));

// Use `vi.hoisted` so the mock fn exists when the `vi.mock` factory below
// runs (vi.mock is hoisted above top-level declarations).
const { mockGetProductSeatTypes } = vi.hoisted(() => ({
  mockGetProductSeatTypes: vi.fn(),
}));
vi.mock("@app/lib/metronome/seat_types", async () => {
  const actual = await vi.importActual<
    typeof import("@app/lib/metronome/seat_types")
  >("@app/lib/metronome/seat_types");
  return {
    ...actual,
    getProductSeatTypes: mockGetProductSeatTypes,
  };
});

// A single seat tier on a fixture contract.
type SeatFixture = {
  seatType: MembershipSeatType;
  // Per-seat AWU recurring credit. Omit for tiers with no AWU allocation (e.g.
  // legacy `workspace`); they sort to 0 in `getDefaultSeatTypeForContract`.
  awu?: number;
  frequency?: "ANNUAL" | "MONTHLY";
  // Adds an `entitled: true` override for this seat's product. Non-legacy rate
  // cards carry every seat product but entitle only the ones they sell.
  entitled?: boolean;
};

// Build a `CachedContract` (and the matching `productId → seatType` map) from a
// concise seat spec, so tests describe only what they exercise. The SDK's
// Subscription has many required fields we don't touch; the partial fixture is
// cast through `unknown`.
function makeContract({
  seats = [],
  isMau = false,
}: {
  seats?: SeatFixture[];
  isMau?: boolean;
} = {}): {
  contract: CachedContract;
  productSeatTypes: Map<string, MembershipSeatType>;
} {
  const productSeatTypes = new Map<string, MembershipSeatType>();
  const subscriptions = [];
  const recurringCredits = [];
  const overrides = [];

  for (const seat of seats) {
    const productId = `${seat.seatType}-product`;
    const subscriptionId = `sub_${seat.seatType}`;
    productSeatTypes.set(productId, seat.seatType);
    subscriptions.push({
      id: subscriptionId,
      subscription_rate: { product: { id: productId, name: seat.seatType } },
    });
    if (seat.awu != null) {
      recurringCredits.push({
        access_amount: { unit_price: seat.awu },
        commit_duration: { value: 1 },
        recurrence_frequency: seat.frequency ?? "MONTHLY",
        subscription_config: { subscription_id: subscriptionId },
      });
    }
    if (seat.entitled) {
      overrides.push({ entitled: true, product: { id: productId } });
    }
  }

  return {
    contract: {
      custom_fields: isMau ? { MAU_THRESHOLD: "1" } : undefined,
      subscriptions,
      ...(recurringCredits.length > 0
        ? { recurring_credits: recurringCredits }
        : {}),
      ...(overrides.length > 0 ? { overrides } : {}),
    } as unknown as CachedContract,
    productSeatTypes,
  };
}

describe("hasContractSeatSubscription", () => {
  beforeEach(() => {
    mockGetProductSeatTypes.mockReset();
  });

  it("returns true when a subscription references a seat-tagged product", async () => {
    const { contract, productSeatTypes } = makeContract({
      seats: [{ seatType: "pro" }],
    });
    mockGetProductSeatTypes.mockResolvedValue(productSeatTypes);
    expect(await hasContractSeatSubscription(contract)).toBe(true);
  });

  it("returns false when subscriptions reference only untagged products", async () => {
    const { contract } = makeContract({ seats: [{ seatType: "pro" }] });
    // No product is tagged as a seat.
    mockGetProductSeatTypes.mockResolvedValue(new Map());
    expect(await hasContractSeatSubscription(contract)).toBe(false);
  });

  it("returns false on MAU contracts even if a tagged product is present", async () => {
    const { contract, productSeatTypes } = makeContract({
      seats: [{ seatType: "workspace" }],
      isMau: true,
    });
    mockGetProductSeatTypes.mockResolvedValue(productSeatTypes);
    expect(await hasContractSeatSubscription(contract)).toBe(false);
  });

  it("returns false when the contract has no subscriptions", async () => {
    const { contract } = makeContract();
    mockGetProductSeatTypes.mockResolvedValue(new Map());
    expect(await hasContractSeatSubscription(contract)).toBe(false);
  });
});

describe("resolveRemappedSeatType", () => {
  // Contract bills `pro_yearly` (8000 AWU) and `max` (40000 AWU) — no monthly
  // `pro`. Lowest non-free tier → `pro_yearly`.
  const { contract, productSeatTypes } = makeContract({
    seats: [
      { seatType: "pro_yearly", awu: 8000, frequency: "ANNUAL" },
      { seatType: "max", awu: 40000, frequency: "MONTHLY" },
    ],
  });

  it("keeps a seat type the contract still bills", () => {
    expect(resolveRemappedSeatType("max", contract, productSeatTypes)).toBe(
      "max"
    );
    expect(
      resolveRemappedSeatType("pro_yearly", contract, productSeatTypes)
    ).toBe("pro_yearly");
  });

  it("converts a monthly seat to its yearly equivalent when present", () => {
    expect(resolveRemappedSeatType("pro", contract, productSeatTypes)).toBe(
      "pro_yearly"
    );
  });

  it("falls back to the default tier (no free) otherwise", () => {
    // `free` has no yearly equivalent on the contract → default lowest tier.
    expect(resolveRemappedSeatType("free", contract, productSeatTypes)).toBe(
      "pro_yearly"
    );
    // `max_yearly` (already yearly) isn't billed → default tier.
    expect(
      resolveRemappedSeatType("max_yearly", contract, productSeatTypes)
    ).toBe("pro_yearly");
  });
});

describe("resolveRemappedSeatType (entitlement-aware)", () => {
  // Contract carries every seat subscription, but only `workspace_yearly` is
  // entitled (the others are dormant `entitled:false` baseline).
  const { contract, productSeatTypes } = makeContract({
    seats: [
      { seatType: "workspace" },
      { seatType: "workspace_yearly", entitled: true },
      { seatType: "pro" },
    ],
  });

  it("does not keep a seat whose subscription exists but is not entitled", () => {
    // `workspace` has a (dormant) subscription but isn't entitled → convert to
    // its entitled yearly equivalent.
    expect(
      resolveRemappedSeatType("workspace", contract, productSeatTypes)
    ).toBe("workspace_yearly");
  });

  it("keeps an entitled seat type", () => {
    expect(
      resolveRemappedSeatType("workspace_yearly", contract, productSeatTypes)
    ).toBe("workspace_yearly");
  });

  it("falls back to the only entitled tier for unrelated seats", () => {
    // `pro` is on the contract but not entitled, no `pro_yearly` entitled →
    // default tier among entitled seats = `workspace_yearly`.
    expect(resolveRemappedSeatType("pro", contract, productSeatTypes)).toBe(
      "workspace_yearly"
    );
  });
});
