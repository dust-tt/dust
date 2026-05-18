import { hasMauSubscriptionInContract } from "@app/lib/metronome/mau_sync";
import type { CachedContract } from "@app/lib/metronome/plan_type";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", () => ({
  getMetronomeContractById: vi.fn(),
  updateSubscriptionQuantity: vi.fn(),
}));

vi.mock("@app/lib/metronome/constants", () => ({
  getProductMauId: () => "mau-product",
  getProductMauTierIds: () => ["mau-tier-1", "mau-tier-2", "mau-tier-3"],
}));

// CachedContract has many required fields the function doesn't read; cast
// partial fixtures through `unknown` so the test stays focused on the
// product id the function actually inspects.
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

describe("hasMauSubscriptionInContract", () => {
  it("returns true when the contract contains the simple MAU product", () => {
    expect(
      hasMauSubscriptionInContract(
        makeContract([{ id: "sub_1", productId: "mau-product" }])
      )
    ).toBe(true);
  });

  it("returns true when the contract contains an MAU tier product", () => {
    expect(
      hasMauSubscriptionInContract(
        makeContract([{ id: "sub_1", productId: "mau-tier-2" }])
      )
    ).toBe(true);
  });

  it("returns false when the contract has no MAU products", () => {
    expect(
      hasMauSubscriptionInContract(
        makeContract([{ id: "sub_1", productId: "other-product" }])
      )
    ).toBe(false);
  });

  it("returns false when the contract has no subscriptions", () => {
    expect(hasMauSubscriptionInContract(makeContract([]))).toBe(false);
  });
});
