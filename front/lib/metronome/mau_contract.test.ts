import { hasMauSubscriptionInContract } from "@app/lib/metronome/mau_sync";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", () => ({
  getMetronomeContractById: vi.fn(),
  updateSubscriptionQuantity: vi.fn(),
}));

vi.mock("@app/lib/metronome/constants", () => ({
  getProductMauId: () => "mau-product",
  getProductMauTierIds: () => ["mau-tier-1", "mau-tier-2", "mau-tier-3"],
}));

describe("hasMauSubscriptionInContract", () => {
  it("returns true when the contract contains the simple MAU product", () => {
    expect(
      hasMauSubscriptionInContract({
        subscriptions: [
          {
            id: "sub_1",
            subscription_rate: { product: { id: "mau-product" } },
          },
        ],
      })
    ).toBe(true);
  });

  it("returns true when the contract contains an MAU tier product", () => {
    expect(
      hasMauSubscriptionInContract({
        subscriptions: [
          {
            id: "sub_1",
            subscription_rate: { product: { id: "mau-tier-2" } },
          },
        ],
      })
    ).toBe(true);
  });

  it("returns false when the contract has no MAU products", () => {
    expect(
      hasMauSubscriptionInContract({
        subscriptions: [
          {
            id: "sub_1",
            subscription_rate: { product: { id: "other-product" } },
          },
        ],
      })
    ).toBe(false);
  });

  it("returns false when the contract has no subscriptions", () => {
    expect(hasMauSubscriptionInContract({})).toBe(false);
  });
});
