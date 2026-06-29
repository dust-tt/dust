import {
  BillingPeriodSwitch,
  PaidPlanCards,
  type PaidPlanTier,
} from "@app/components/pages/onboarding/SubscriptionPlans";
import { DontLoseSection } from "@app/components/paywall/DontLoseSection";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useAppRouter } from "@app/lib/platform";
import type { BillingPeriod } from "@app/types/plan";
import { Card, ContentMessage, DustLogo } from "@dust-tt/sparkle";
import { useState } from "react";

export function TrialEndedPage() {
  const { workspace, user: authUser } = useAuth();
  const router = useAppRouter();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");

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
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      {/* Logo and headline */}
      <div className="mb-12 flex flex-col items-center">
        <DustLogo className="h-8 w-32" />
        <h1 className="mt-4 text-xl font-medium text-foreground dark:text-foreground-night">
          Your free trial has ended
        </h1>
      </div>

      {/* Main content: two columns */}
      <div className="flex w-full max-w-5xl flex-col gap-8 lg:flex-row lg:items-center lg:gap-12">
        {/* Left column: Don't lose section */}
        <div className="flex-1">
          <DontLoseSection owner={workspace} />
        </div>

        {/* Right column: billing toggle + Pro / Max plan cards */}
        <Card
          variant="secondary"
          size="md"
          className="flex flex-[1.5] flex-col gap-4"
        >
          <div className="flex justify-center">
            <BillingPeriodSwitch
              defaultValue={billingPeriod}
              onValueChange={setBillingPeriod}
            />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row">
            <PaidPlanCards
              billingPeriod={billingPeriod}
              onSubscribe={(seatType) => void handleSubscribe(seatType)}
            />
          </div>
        </Card>
      </div>

      {/* Footer banner */}
      <div className="mt-12 w-full max-w-5xl">
        <ContentMessage
          variant="primary"
          size="lg"
          className="text-center text-sm"
        >
          Without a subscription, your agents and connections will be paused.{" "}
          <span className="font-semibold">
            We'll keep your data safe for 30 days.
          </span>
        </ContentMessage>
      </div>
    </main>
  );
}
