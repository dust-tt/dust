import {
  BillingPeriodSwitch,
  FreePlanCard,
  PaidPlanCards,
  type PaidPlanTier,
} from "@app/components/pages/onboarding/SubscriptionPlans";
import { UserMenu } from "@app/components/UserMenu";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useAppRouter } from "@app/lib/platform";
import { useUser } from "@app/lib/swr/user";
import type { BillingPeriod } from "@app/types/plan";
import { BarHeader } from "@dust-tt/sparkle";
import React from "react";

export function SelectSubscriptionPage() {
  const { workspace, user: authUser } = useAuth();
  const router = useAppRouter();
  const { user } = useUser();

  const [billingPeriod, setBillingPeriod] =
    React.useState<BillingPeriod>("monthly");

  const { submit: startFreePlan } = useSubmitFunction(async () => {
    await router.push(`/w/${workspace.sId}/verify`);
  });

  const { submit: handleSubscribe } = useSubmitFunction(
    async (seatType: PaidPlanTier) => {
      const query = new URLSearchParams({
        seatType,
        billingPeriod,
        targetUserId: authUser.sId,
      });
      await router.push(
        `/w/${workspace.sId}/subscription/checkout?${query.toString()}`
      );
    }
  );

  return (
    <>
      <BarHeader
        title="Choose your plan"
        className="ml-10 lg:ml-0"
        rightActions={
          user && <UserMenu user={user} owner={workspace} subscription={null} />
        }
      />
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-4xl font-bold text-foreground dark:text-foreground-night">
            Choose how you want to start
          </h1>
          <p className="text-lg text-muted-foreground dark:text-muted-foreground-night">
            Free to begin. Upgrade anytime.
          </p>
        </div>

        <BillingPeriodSwitch onValueChange={setBillingPeriod} />

        <div className="flex w-full max-w-4xl flex-col items-stretch gap-4 md:flex-row">
          <div className="flex flex-1">
            <FreePlanCard onStartFree={() => void startFreePlan()} />
          </div>

          {/* Paid plans share a subtle wrapper to group them visually next to
              the Free plan. */}
          <div className="flex flex-[2] flex-col gap-3 rounded-3xl border border-border bg-muted-background p-3 dark:border-border-night dark:bg-muted-background-night sm:flex-row">
            <PaidPlanCards
              billingPeriod={billingPeriod}
              onSubscribe={(seatType) => void handleSubscribe(seatType)}
            />
          </div>
        </div>
      </div>
    </>
  );
}
