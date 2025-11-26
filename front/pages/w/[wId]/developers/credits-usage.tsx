import { Button, CardIcon, ContentMessage, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import React, { useMemo, useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { BuyCreditDialog } from "@app/components/workspace/BuyCreditDialog";
import { CreditsList } from "@app/components/workspace/CreditsList";
import { ProgrammaticCostChart } from "@app/components/workspace/ProgrammaticCostChart";
import { getFeatureFlags } from "@app/lib/auth";
import { getPriceAsString } from "@app/lib/client/subscription";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { isEntreprisePlan } from "@app/lib/plans/plan_codes";
import { useCredits, usePurchaseCredits } from "@app/lib/swr/credits";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { SubscriptionType, WorkspaceType } from "@app/types";
import type { CreditDisplayData } from "@app/types/credits";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();

  if (!auth.isAdmin()) {
    return { notFound: true };
  }

  // Check if the feature flag is enabled
  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("ppul")) {
    return { notFound: true };
  }

  return {
    props: {
      owner,
      subscription,
    },
  };
});

function isExpired(credit: CreditDisplayData): boolean {
  const now = Date.now();
  return credit.expirationDate !== null && credit.expirationDate <= now;
}

interface CreditsSummaryProps {
  credits: CreditDisplayData[];
  isLoading: boolean;
}

function CreditsSummary({ credits, isLoading }: CreditsSummaryProps) {
  const { totalRemaining, nextExpiration } = useMemo(() => {
    const activeCredits = credits.filter((c) => !isExpired(c));

    const total = activeCredits.reduce(
      (sum, credit) => sum + credit.remainingAmount,
      0
    );

    // Find the next expiration date among active credits with remaining balance
    const creditsWithExpiration = activeCredits.filter(
      (c) => c.expirationDate !== null && c.remainingAmount > 0
    );
    const nextExp =
      creditsWithExpiration.length > 0
        ? Math.min(...creditsWithExpiration.map((c) => c.expirationDate!))
        : null;

    return {
      totalRemaining: total,
      nextExpiration: nextExp,
    };
  }, [credits]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted-background p-8 dark:border-border-night dark:bg-muted-background-night">
        <div className="h-16 w-32 animate-pulse rounded bg-muted-foreground/20" />
      </div>
    );
  }

  const formattedRemaining = getPriceAsString({
    currency: "usd",
    priceInCents: totalRemaining,
  });

  const expirationText = nextExpiration
    ? new Date(nextExpiration).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="rounded-lg border border-border bg-muted-background p-8 dark:border-border-night dark:bg-muted-background-night">
      <div className="flex flex-col items-center gap-2">
        <div className="text-sm font-medium text-muted-foreground dark:text-muted-foreground-night">
          Total Credits Remaining
        </div>
        <div className="text-5xl font-bold text-foreground dark:text-foreground-night">
          {formattedRemaining}
        </div>
        {expirationText && (
          <div className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
            Next expiration: {expirationText}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CreditsUsagePage({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [showBuyCreditDialog, setShowBuyCreditDialog] = useState(false);
  const { hasFeature, featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const isEnterprise = isEntreprisePlan(subscription.plan.code);
  const isApiAndProgrammaticEnabled = hasFeature("ppul");
  const { credits, isCreditsLoading } = useCredits({
    workspaceId: owner.sId,
    disabled: !isApiAndProgrammaticEnabled,
  });
  const { isLoading: isPurchasingCredits } = usePurchaseCredits({
    workspaceId: owner.sId,
  });

  return (
    <AppCenteredLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({
        owner,
        current: "credits_usage",
        featureFlags,
      })}
    >
      <BuyCreditDialog
        isOpen={showBuyCreditDialog}
        onClose={() => setShowBuyCreditDialog(false)}
        workspaceId={owner.sId}
        isEnterprise={isEnterprise}
      />

      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Credits & Usage"
          icon={CardIcon}
          description="Monitor and manage your programmatic API usage credits."
        />

        <Page.Vertical align="stretch" gap="xl">
          <CreditsSummary credits={credits} isLoading={isCreditsLoading} />

          <div className="flex w-full items-center justify-between">
            <Page.H variant="h5">Credit Details</Page.H>
            <Button
              label="Buy Credits"
              variant="primary"
              disabled={subscription.trialing || isPurchasingCredits}
              isLoading={isPurchasingCredits}
              onClick={() => setShowBuyCreditDialog(true)}
            />
          </div>

          <CreditsList credits={credits} isLoading={isCreditsLoading} />

          {subscription.trialing && (
            <ContentMessage title="Available after trial" variant="info">
              Credit purchases are available once you upgrade to a paid plan.
            </ContentMessage>
          )}

          <ProgrammaticCostChart workspaceId={owner.sId} />
        </Page.Vertical>
      </Page.Vertical>
      <div className="h-12" />
    </AppCenteredLayout>
  );
}

CreditsUsagePage.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
