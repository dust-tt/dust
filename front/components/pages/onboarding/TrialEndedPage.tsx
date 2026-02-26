import { DontLoseSection } from "@app/components/paywall/DontLoseSection";
import { TrialPricingCard } from "@app/components/paywall/TrialPricingCard";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useAppRouter } from "@app/lib/platform";
import { useFetcher } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
import type { BillingPeriod } from "@app/types/plan";
import { Card, ContentMessage, DustLogo } from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useState } from "react";

export function TrialEndedPage() {
  const { fetcherWithBody } = useFetcher();
  const { workspace } = useAuth();
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");

  const { submit: handleSubscribePlan, isSubmitting } = useSubmitFunction(
    async (period: BillingPeriod) => {
      try {
        const content = await fetcherWithBody([
          `/api/w/${workspace.sId}/subscriptions`,
          { billingPeriod: period },
          "POST",
        ]);
        if (content.checkoutUrl) {
          await router.push(content.checkoutUrl);
        } else {
          sendNotification({
            type: "error",
            title: "Subscription failed",
            description:
              "Failed to subscribe to a new plan. Please try again in a few minutes.",
          });
        }
      } catch (e) {
        if (isAPIErrorResponse(e)) {
          sendNotification({
            type: "error",
            title: "Subscription failed",
            description: e.error.message,
          });
        } else {
          sendNotification({
            type: "error",
            title: "Subscription failed",
            description: "Failed to subscribe to a new plan.",
          });
        }
      }
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
      <div className="flex w-full max-w-4xl flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
        {/* Left column: Don't lose section */}
        <div className="flex-1">
          <DontLoseSection owner={workspace} />
        </div>

        {/* Right column: Pricing card */}
        <Card variant="secondary" size="md" className="flex-1">
          <TrialPricingCard
            billingPeriod={billingPeriod}
            onBillingPeriodChange={setBillingPeriod}
            onSubscribe={() => handleSubscribePlan(billingPeriod)}
            isSubmitting={isSubmitting}
          />
        </Card>
      </div>

      {/* Footer banner */}
      <div className="mt-12 w-full max-w-4xl">
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
