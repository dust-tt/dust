import { ProPlansTable } from "@app/components/plans/ProPlansTable";
import { UserMenu } from "@app/components/UserMenu";
import WorkspacePicker from "@app/components/WorkspacePicker";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  CP_MAX_SEAT_COST_MONTHLY,
  CP_MAX_SEAT_COST_YEARLY,
  CP_PRO_SEAT_COST_MONTHLY,
  CP_PRO_SEAT_COST_YEARLY,
} from "@app/lib/client/subscription";
import { useSubmitFunction } from "@app/lib/client/utils";
import { isFreeTrialPhonePlan, isOldFreePlan } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import { useKillSwitches } from "@app/lib/swr/kill";
import { useUser } from "@app/lib/swr/user";
import {
  useSubscriptionStatus,
  useWorkspaceSubscriptions,
} from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { BillingPeriod } from "@app/types/plan";
import { isDevelopment } from "@app/types/shared/env";
import {
  BarHeader,
  Button,
  ButtonGroup,
  Chip,
  Lock01,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import { CreditCardIcon } from "@heroicons/react/20/solid";
import React, { useEffect } from "react";

function CPSubscribePage() {
  const { workspace, isAdmin, user: authUser } = useAuth();
  const router = useAppRouter();
  const { user } = useUser();
  const { shouldRedirect, redirectUrl, isSubscriptionStatusLoading } =
    useSubscriptionStatus({ workspaceId: workspace.sId });

  const [billingPeriod, setBillingPeriod] =
    React.useState<BillingPeriod>("monthly");
  const [seatType, setSeatType] = React.useState<"pro" | "max">("pro");

  const { submit: handleSubscribe } = useSubmitFunction(
    async (params: {
      seatType: "pro" | "max";
      billingPeriod: BillingPeriod;
    }) => {
      const query = new URLSearchParams({
        seatType: params.seatType,
        billingPeriod: params.billingPeriod,
        targetUserId: authUser.sId,
      });
      await router.push(
        `/w/${workspace.sId}/subscription/checkout?${query.toString()}`
      );
    }
  );

  useEffect(() => {
    if (shouldRedirect && redirectUrl) {
      void router.replace(redirectUrl);
    }
  }, [shouldRedirect, redirectUrl, router]);

  if (isSubscriptionStatusLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <>
        <BarHeader
          title="Joining Dust"
          className="ml-10 lg:ml-0"
          rightActions={
            user && (
              <UserMenu user={user} owner={workspace} subscription={null} />
            )
          }
        />
        <Page>
          <div className="flex h-full flex-col justify-center">
            <Page.Horizontal>
              <Page.Vertical sizing="grow" gap="lg">
                <Page.Header icon={Lock01} title="Workspace locked" />
                <Page.P>
                  <span className="font-bold">
                    The subscription for this workspace is not active.
                  </span>
                </Page.P>
                <Page.P>
                  To unlock premium features, your workspace needs to be
                  upgraded by an admin.
                </Page.P>
              </Page.Vertical>
            </Page.Horizontal>
          </div>
        </Page>
      </>
    );
  }

  return (
    <>
      <BarHeader
        title="Subscribe to Business"
        className="ml-10 lg:ml-0"
        rightActions={
          <div className="flex flex-row items-center">
            {user && (
              <UserMenu user={user} owner={workspace} subscription={null} />
            )}
          </div>
        }
      />
      <Page>
        <div className="flex h-full flex-col items-center justify-center gap-8">
          {/* Placeholder banner */}
          <div className="w-full max-w-xl rounded-xl border border-warning-200 bg-warning-100 p-4 text-center dark:border-warning-200-night dark:bg-warning-100-night">
            <p className="text-lg font-bold text-foreground dark:text-foreground-night">
              Placeholder — Page to be designed
            </p>
            <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
              This page has not been designed yet.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <Page.Header
              icon={CreditCardIcon}
              title="Choose your Business plan"
            />
            <Page.P>
              Select a seat type and billing period to get started.
            </Page.P>
          </div>

          {/* Billing period toggle */}
          <div className="flex items-center gap-3">
            <ButtonGroup>
              <Button
                size="sm"
                variant={billingPeriod === "monthly" ? "primary" : "outline"}
                label="Monthly"
                onClick={() => setBillingPeriod("monthly")}
              />
              <Button
                size="sm"
                variant={billingPeriod === "yearly" ? "primary" : "outline"}
                label="Yearly"
                onClick={() => setBillingPeriod("yearly")}
              />
            </ButtonGroup>
            {billingPeriod === "yearly" && (
              <Chip size="xs" color="green" label="Save 20%" />
            )}
          </div>

          {/* Seat type cards */}
          <div className="flex w-full max-w-xl flex-col gap-4">
            {(
              [
                {
                  type: "pro" as const,
                  name: "Pro",
                  monthlyPrice: `$${CP_PRO_SEAT_COST_MONTHLY}/mo`,
                  yearlyPrice: `$${CP_PRO_SEAT_COST_YEARLY}/mo`,
                  yearlyTotal: `$${CP_PRO_SEAT_COST_YEARLY * 12} billed yearly`,
                  creditsLabel: "8,000 credits/month",
                },
                {
                  type: "max" as const,
                  name: "Max",
                  monthlyPrice: `$${CP_MAX_SEAT_COST_MONTHLY}/mo`,
                  yearlyPrice: `$${CP_MAX_SEAT_COST_YEARLY}/mo`,
                  yearlyTotal: `$${CP_MAX_SEAT_COST_YEARLY * 12} billed yearly`,
                  creditsLabel: "40,000 credits/month",
                },
              ] satisfies Array<{
                type: "pro" | "max";
                name: string;
                monthlyPrice: string;
                yearlyPrice: string;
                yearlyTotal: string;
                creditsLabel: string;
              }>
            ).map((seat) => (
              <button
                key={seat.type}
                type="button"
                onClick={() => setSeatType(seat.type)}
                className={`flex w-full flex-col gap-2 rounded-xl border-2 p-5 text-left transition-colors ${
                  seatType === seat.type
                    ? "border-highlight-500 bg-highlight-500/10"
                    : "border-separator dark:border-separator-night hover:border-muted-foreground/40"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-lg font-semibold text-foreground dark:text-foreground-night">
                      {seat.name}
                    </span>
                    <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      {seat.creditsLabel}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-xl font-bold text-foreground dark:text-foreground-night">
                      {billingPeriod === "monthly"
                        ? seat.monthlyPrice
                        : seat.yearlyPrice}
                    </span>
                    {billingPeriod === "yearly" && (
                      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                        {seat.yearlyTotal}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <Button
            variant="primary"
            label="Continue to checkout"
            icon={CreditCardIcon}
            size="sm"
            onClick={withTracking(
              TRACKING_AREAS.AUTH,
              "cp_subscription_start",
              () => {
                void handleSubscribe({ seatType, billingPeriod });
              },
              {
                seat_type: seatType,
                billing_period: billingPeriod,
              }
            )}
          />
        </div>
      </Page>
    </>
  );
}

function LegacySubscribePage() {
  const { workspace, isAdmin } = useAuth();
  const router = useAppRouter();
  const { user } = useUser();

  const { subscriptions } = useWorkspaceSubscriptions({
    owner: workspace,
    disabled: !isAdmin,
  });

  const [billingPeriod, setBillingPeriod] =
    React.useState<BillingPeriod>("monthly");

  const { submit: handleSubscribePlan } = useSubmitFunction(
    async (billingPeriod) => {
      await router.push(
        `/w/${workspace.sId}/subscription/checkout?billingPeriod=${billingPeriod}`
      );
    }
  );

  // Check if we need to redirect to trial-ended page.
  const { shouldRedirect, redirectUrl, isSubscriptionStatusLoading } =
    useSubscriptionStatus({ workspaceId: workspace.sId });

  useEffect(() => {
    if (shouldRedirect && redirectUrl) {
      void router.replace(redirectUrl);
    }
  }, [shouldRedirect, redirectUrl, router]);

  // Show loading while checking redirect.
  if (isSubscriptionStatusLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // We treat user as being in free trial if they don't have any non free subs,
  // regardless of whether they're active or not.
  const isInFreePhoneTrial =
    subscriptions.length > 0 &&
    !subscriptions.some((sub) => !isFreeTrialPhonePlan(sub.plan.code));

  // If you had another subscription before, you will not get the free trial again: we use this to show the correct message.
  // Current plan is either FREE_NO_PLAN or FREE_TEST_PLAN if you're on this paywall.
  // FREE_NO_PLAN is not on the database, checking it comes down to having at least 1 subscription.
  const noPreviousSubscription =
    subscriptions.length === 0 ||
    (subscriptions.length === 1 && isOldFreePlan(subscriptions[0].plan.code)); // FREE_TEST_PLAN did not pay, they should be asked to start instead of resume

  // Show workspace picker if user has multiple WorkOS orgs, or in dev
  // mode fall back to local DB workspaces (no orgs in seeded envs).
  const shouldShowPicker =
    !!(user?.organizations && user.organizations.length > 1) ||
    (isDevelopment() &&
      !user?.organizations?.length &&
      !!user &&
      user.workspaces.length > 1);

  return (
    <>
      <BarHeader
        title="Joining Dust"
        className="ml-10 lg:ml-0"
        rightActions={
          <>
            <div className="flex flex-row items-center">
              {user && shouldShowPicker && (
                <WorkspacePicker user={user} workspace={workspace} />
              )}
              <div>
                {user && (
                  <UserMenu user={user} owner={workspace} subscription={null} />
                )}
              </div>
            </div>
          </>
        }
      />
      <Page>
        <div className="flex h-full flex-col justify-center">
          {isAdmin ? (
            <Page.Horizontal>
              <Page.Vertical sizing="grow" gap="lg">
                <Page.Header
                  icon={CreditCardIcon}
                  title={
                    isInFreePhoneTrial
                      ? "Subscribe to a paid plan"
                      : noPreviousSubscription
                        ? "Start your subscription"
                        : "Resume your subscription"
                  }
                />
                {isInFreePhoneTrial ? (
                  <>
                    <Page.P>
                      <span className="font-bold">
                        You're currently on a free trial.
                      </span>
                    </Page.P>
                    <Page.P>
                      To continue using Dust after your trial ends, subscribe to
                      a paid plan. Select your preferred billing option to get
                      started.
                    </Page.P>
                  </>
                ) : !noPreviousSubscription ? (
                  <>
                    <Page.P>
                      <span className="font-bold">
                        Welcome back! You can reactivate your subscription
                        anytime.
                      </span>
                    </Page.P>
                    <Page.P>
                      Please note that if your previous contract expired over 15
                      days ago, previously stored data will no longer be
                      available. This is to ensure privacy and security of your
                      information.
                    </Page.P>
                  </>
                ) : (
                  <>
                    <Page.P>
                      <span className="font-bold">
                        Subscribe to the Pro plan.
                      </span>
                    </Page.P>
                    <Page.P>
                      You'll be charged immediately. You can cancel at any time.
                    </Page.P>
                  </>
                )}

                {billingPeriod === "monthly" ? (
                  <>
                    <Page.P>
                      <span className="font-bold">
                        You've selected monthly billing.
                      </span>
                    </Page.P>
                    <Page.P>
                      You'll pay on a month-to-month basis. You can cancel at
                      any time before the end of your monthly billing cycle.
                    </Page.P>
                  </>
                ) : (
                  <>
                    <Page.P>
                      <span className="font-bold">
                        You've selected yearly billing.
                      </span>
                    </Page.P>
                    <Page.P>
                      You'll pay for a year upfront and enjoy savings compared
                      to the monthly plan. You can cancel at any time before the
                      end of your annual billing cycle.
                    </Page.P>
                  </>
                )}

                <Button
                  variant="primary"
                  label={
                    !noPreviousSubscription
                      ? isInFreePhoneTrial
                        ? `Subscribe with ${billingPeriod} billing`
                        : `Resume with ${billingPeriod} billing`
                      : `Start your subscription with ${billingPeriod} billing`
                  }
                  icon={CreditCardIcon}
                  size="sm"
                  onClick={withTracking(
                    TRACKING_AREAS.AUTH,
                    "subscription_start",
                    () => {
                      void handleSubscribePlan(billingPeriod);
                    },
                    {
                      billing_period: billingPeriod,
                      is_trial: noPreviousSubscription ? "true" : "false",
                    }
                  )}
                />
              </Page.Vertical>
              <Page.Horizontal sizing="grow">
                <ProPlansTable
                  owner={workspace}
                  size="xs"
                  display="subscribe"
                  setBillingPeriod={setBillingPeriod}
                />
              </Page.Horizontal>
            </Page.Horizontal>
          ) : (
            <Page.Horizontal>
              <Page.Vertical sizing="grow" gap="lg">
                <Page.Header icon={Lock01} title="Workspace locked" />
                <Page.P>
                  <span className="font-bold">
                    The subscription for this workspace is not active.
                  </span>
                </Page.P>
                <Page.P>
                  To unlock premium features, your workspace needs to be
                  upgraded by an admin.
                </Page.P>
              </Page.Vertical>
              <Page.Vertical sizing="grow">
                <ProPlansTable
                  owner={workspace}
                  size="xs"
                  display="subscribe"
                  setBillingPeriod={setBillingPeriod}
                />
              </Page.Vertical>
            </Page.Horizontal>
          )}
        </div>
      </Page>
    </>
  );
}

export function SubscribePage() {
  const { hasFeature } = useFeatureFlags();
  const { killSwitches } = useKillSwitches();

  const isMetronomeEnabled =
    hasFeature("metronome_billing") ||
    !killSwitches?.includes("global_disable_metronome_billing");
  const isMetronomeCheckout =
    isMetronomeEnabled && hasFeature("metronome_cp_checkout");

  if (isMetronomeCheckout) {
    return <CPSubscribePage />;
  }

  return <LegacySubscribePage />;
}
