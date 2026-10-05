import type { CachedContract } from "@app/lib/metronome/plan_type";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { getProductSeatTypes } from "@app/lib/metronome/seat_types";
import type { MembershipSeatType } from "@app/types/memberships";
import { vi } from "vitest";

export type SeatFixture = {
  seatType: MembershipSeatType;
  awu?: number;
  entitled?: boolean;
};

type ContractOverride = {
  entitled: boolean;
  starting_at?: string;
  product: { id: string };
};

export function buildCachedContractMock({
  seats = [],
  overrides,
}: {
  seats?: SeatFixture[];
  overrides?: ContractOverride[];
} = {}): {
  contract: CachedContract;
  productSeatTypes: Map<string, MembershipSeatType>;
} {
  const productSeatTypes = new Map<string, MembershipSeatType>();
  const subscriptions = [];
  const recurringCredits = [];
  const autoOverrides: ContractOverride[] = [];

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
        recurrence_frequency: "MONTHLY",
        subscription_config: { subscription_id: subscriptionId },
      });
    }
    if (seat.entitled) {
      autoOverrides.push({ entitled: true, product: { id: productId } });
    }
  }

  return {
    contract: {
      subscriptions,
      recurring_credits: recurringCredits,
      overrides: overrides ?? autoOverrides,
    } as unknown as CachedContract,
    productSeatTypes,
  };
}

export const POOL_ONLY_SEATS: SeatFixture[] = [
  { seatType: "workspace_yearly", entitled: true },
  { seatType: "pro" },
  { seatType: "free" },
];

export const SEAT_BASED_SEATS: SeatFixture[] = [
  { seatType: "pro_yearly", entitled: true },
  { seatType: "workspace_yearly" },
];

/**
 * Requires the calling test file to `vi.mock` `getActiveContract` (`@app/lib/metronome/plan_type`)
 * and `getProductSeatTypes` (`@app/lib/metronome/seat_types`).
 */
export function mockActiveContract(seats: SeatFixture[]) {
  const { contract, productSeatTypes } = buildCachedContractMock({ seats });
  vi.mocked(getActiveContract).mockResolvedValue(contract);
  vi.mocked(getProductSeatTypes).mockResolvedValue(productSeatTypes);
}
