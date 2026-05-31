import type { CachedContract } from "@app/lib/metronome/plan_type";
import {
  classifySeatChange,
  hasContractSeatSubscription,
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

describe("classifySeatChange", () => {
  const productSeatTypes = new Map<string, MembershipSeatType>([
    ["workspace-product", "workspace"],
    ["pro-product", "pro"],
  ]);

  // Contract with a (zero-allowance) workspace seat and a pro seat carrying an
  // 8000-AWU recurring credit, plus a next billing period to defer to.
  const contract = {
    subscriptions: [
      {
        id: "sub_ws",
        subscription_rate: {
          product: { id: "workspace-product", name: "ws" },
        },
        billing_periods: { next: { starting_at: "2026-07-01T00:00:00Z" } },
      },
      {
        id: "sub_pro",
        subscription_rate: { product: { id: "pro-product", name: "pro" } },
      },
    ],
    recurring_credits: [
      {
        access_amount: { unit_price: 8000 },
        commit_duration: { value: 1 },
        recurrence_frequency: "MONTHLY",
        subscription_config: { subscription_id: "sub_pro" },
      },
    ],
  } as unknown as CachedContract;

  it("defers removal to the next period even from a zero-allowance seat", () => {
    const outcome = classifySeatChange({
      contract,
      productSeatTypes,
      change: {
        userId: "u1",
        previousSeatType: "workspace",
        newSeatType: "none",
      },
    });
    expect(outcome).toEqual({
      kind: "deferred",
      at: new Date("2026-07-01T00:00:00Z"),
    });
  });

  it("defers removal from a paid seat to the next period", () => {
    const outcome = classifySeatChange({
      contract,
      productSeatTypes,
      change: { userId: "u1", previousSeatType: "pro", newSeatType: "none" },
    });
    expect(outcome?.kind).toBe("deferred");
  });

  it("applies re-adding a seat (none → pro) immediately", () => {
    const outcome = classifySeatChange({
      contract,
      productSeatTypes,
      change: { userId: "u1", previousSeatType: "none", newSeatType: "pro" },
    });
    expect(outcome).toEqual({ kind: "immediate" });
  });
});
