import type { CachedContract } from "@app/lib/metronome/plan_type";
import { hasContractSeatSubscription } from "@app/lib/metronome/seats";
import type { Subscription } from "@metronome/sdk/resources";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", () => ({
  getMetronomeContractById: vi.fn(),
  updateSubscriptionQuantity: vi.fn(),
}));

vi.mock("@app/lib/metronome/constants", () => ({
  getSeatTypeForProductId: (product: Subscription.SubscriptionRate.Product) => {
    if (product.id === "workspace-seat-product") {
      return "workspace";
    }
    if (product.id === "pro-seat-product") {
      return "pro";
    }
    if (product.id === "max-seat-product") {
      return "max";
    }
    return undefined;
  },
}));

// SDK's Subscription has many required fields we don't exercise; cast partial
// fixtures through `unknown` so the test stays focused on the product/id pair
// the function actually reads.
function makeContract(
  subscriptions: Array<{ id: string; productId: string }>
): CachedContract {
  return {
    subscriptions: subscriptions.map(({ id, productId }) => ({
      id,
      subscription_rate: { product: { id: productId, name: productId } },
    })),
  } as unknown as CachedContract;
}

describe("hasContractSeatSubscription", () => {
  it("returns true when the contract contains a workspace seat product", () => {
    expect(
      hasContractSeatSubscription(
        makeContract([{ id: "sub_1", productId: "workspace-seat-product" }])
      )
    ).toBe(true);
  });

  it("returns true for pro/max seat products", () => {
    expect(
      hasContractSeatSubscription(
        makeContract([{ id: "sub_pro", productId: "pro-seat-product" }])
      )
    ).toBe(true);
  });

  it("returns false when the contract does not contain a seat product", () => {
    expect(
      hasContractSeatSubscription(
        makeContract([{ id: "sub_1", productId: "other-product" }])
      )
    ).toBe(false);
  });

  it("returns false when the contract has no subscriptions", () => {
    expect(hasContractSeatSubscription(makeContract([]))).toBe(false);
  });
});
