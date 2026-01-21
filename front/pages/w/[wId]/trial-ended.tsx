import { Card, ContentMessage, DustLogo } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React, { useState } from "react";

import { DontLoseSection } from "@app/components/paywall/DontLoseSection";
import { TrialPricingCard } from "@app/components/paywall/TrialPricingCard";
import { ThemeProvider } from "@app/components/sparkle/ThemeContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import type { BillingPeriod, WorkspaceType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  owner: WorkspaceType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  if (!owner || !auth.isAdmin()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
    },
  };
});

export default function TrialEnded({
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const sendNotification = useSendNotification();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");

  const { submit: handleSubscribePlan, isSubmitting } = useSubmitFunction(
    async (period: BillingPeriod) => {
      const res = await clientFetch(`/api/w/${owner.sId}/subscriptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billingPeriod: period,
        }),
      });

      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Subscription failed",
          description: "Failed to subscribe to a new plan.",
        });
      } else {
        const content = await res.json();
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
      }
    }
  );

  return (
    <ThemeProvider>
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
            <DontLoseSection owner={owner} />
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
    </ThemeProvider>
  );
}
