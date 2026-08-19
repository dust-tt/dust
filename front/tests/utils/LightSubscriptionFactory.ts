import { LightPlanFactory } from "@app/tests/utils/LightPlanFactory";
import type { SubscriptionType } from "@app/types/plan";

// Sync, in-memory factory for component tests. This does not touch the
// database — use it from tests that render React components and only need
// a plausibly-shaped subscription object.
export class LightSubscriptionFactory {
  private static counter = 0;

  static build(overrides: Partial<SubscriptionType> = {}): SubscriptionType {
    const id = ++LightSubscriptionFactory.counter;
    return {
      sId: `sub_test_${id}`,
      status: "active",
      trialing: false,
      stripeSubscriptionId: `sub_stripe_test_${id}`,
      metronomeContractId: null,
      startDate: null,
      endDate: null,
      paymentFailingSince: null,
      plan: LightPlanFactory.build(),
      requestCancelAt: null,
      ...overrides,
    };
  }
}
