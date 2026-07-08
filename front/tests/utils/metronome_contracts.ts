import type { CachedContract } from "@app/lib/metronome/plan_type";
import type { MembershipSeatType } from "@app/types/memberships";

export type SeatFixture = {
  seatType: MembershipSeatType;
  awu?: number;
  entitled?: boolean;
};

export type ContractOverride = {
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
