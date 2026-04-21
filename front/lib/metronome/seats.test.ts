import { getSeatSubscriptionIdFromContract } from "@app/lib/metronome/seats";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/metronome/client", () => ({
  getMetronomeContractById: vi.fn(),
  updateSubscriptionQuantity: vi.fn(),
}));

vi.mock("@app/lib/metronome/constants", () => ({
  getProductWorkspaceSeatId: () => "workspace-seat-product",
}));

describe("getSeatSubscriptionIdFromContract", () => {
  it("returns the seat subscription ID when the contract contains the seat product", () => {
    expect(
      getSeatSubscriptionIdFromContract({
        subscriptions: [
          {
            id: "sub_1",
            subscription_rate: { product: { id: "workspace-seat-product" } },
          },
        ],
      })
    ).toBe("sub_1");
  });

  it("returns undefined when the contract does not contain the seat product", () => {
    expect(
      getSeatSubscriptionIdFromContract({
        subscriptions: [
          {
            id: "sub_1",
            subscription_rate: { product: { id: "other-product" } },
          },
        ],
      })
    ).toBeUndefined();
  });

  it("returns undefined when the contract has no subscriptions", () => {
    expect(getSeatSubscriptionIdFromContract({})).toBeUndefined();
  });
});
