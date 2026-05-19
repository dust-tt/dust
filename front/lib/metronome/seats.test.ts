import type { CachedContract } from "@app/lib/metronome/plan_type";
import { hasContractSeatSubscription } from "@app/lib/metronome/seats";
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

// SDK's Subscription has many required fields we don't exercise; cast partial
// fixtures through `unknown` so the test stays focused on the product IDs the
// function actually reads.
function makeContract({
  subscriptions = [],
  isMau = false,
}: {
  subscriptions?: Array<{ id: string; productId?: string }>;
  isMau?: boolean;
} = {}): CachedContract {
  return {
    custom_fields: isMau ? { MAU_THRESHOLD: "1" } : undefined,
    subscriptions: subscriptions.map(({ id, productId }) => ({
      id,
      subscription_rate: {
        product: { id: productId ?? `${id}-product`, name: id },
      },
    })),
  } as unknown as CachedContract;
}

describe("hasContractSeatSubscription", () => {
  beforeEach(() => {
    mockGetProductSeatTypes.mockReset();
  });

  it("returns true when a subscription references a seat-tagged product", async () => {
    mockGetProductSeatTypes.mockResolvedValue(
      new Map([["pro-product", "pro"]])
    );
    expect(
      await hasContractSeatSubscription(
        makeContract({
          subscriptions: [{ id: "sub_pro", productId: "pro-product" }],
        })
      )
    ).toBe(true);
  });

  it("returns false when subscriptions reference only untagged products", async () => {
    mockGetProductSeatTypes.mockResolvedValue(new Map());
    expect(
      await hasContractSeatSubscription(
        makeContract({ subscriptions: [{ id: "sub_other" }] })
      )
    ).toBe(false);
  });

  it("returns false on MAU contracts even if a tagged product is present", async () => {
    mockGetProductSeatTypes.mockResolvedValue(
      new Map([["workspace-product", "workspace"]])
    );
    expect(
      await hasContractSeatSubscription(
        makeContract({
          subscriptions: [{ id: "sub", productId: "workspace-product" }],
          isMau: true,
        })
      )
    ).toBe(false);
  });

  it("returns false when the contract has no subscriptions", async () => {
    mockGetProductSeatTypes.mockResolvedValue(new Map());
    expect(await hasContractSeatSubscription(makeContract())).toBe(false);
  });
});
