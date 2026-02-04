import { BarHeader, Button, LockIcon, Page, Spinner } from "@dust-tt/sparkle";
import { CreditCardIcon } from "@heroicons/react/20/solid";
import React, { useEffect } from "react";

import { ProPlansTable } from "@app/components/plans/ProPlansTable";
import { UserMenu } from "@app/components/UserMenu";
import WorkspacePicker from "@app/components/WorkspacePicker";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { isFreeTrialPhonePlan, isOldFreePlan } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import { useUser } from "@app/lib/swr/user";
import {
  useSubscriptionStatus,
  useWorkspaceSubscriptions,
} from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { BillingPeriod } from "@app/types";

export function SubscribePage() {
  const { workspace, isAdmin } = useAuth();
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const { user } = useUser();

  const { subscriptions } = useWorkspaceSubscriptions({
    owner: workspace,
  });

  const [billingPeriod, setBillingPeriod] =
    React.useState<BillingPeriod>("monthly");

  const { submit: handleSubscribePlan } = useSubmitFunction(
    async (billingPeriod) => {
      const res = await clientFetch(`/api/w/${workspace.sId}/subscriptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          billingPeriod,
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
        } else if (content.success) {
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
  const isInFreePhoneTrial = !subscriptions.some(
    (sub) => !isFreeTrialPhonePlan(sub.plan.code)
  );

  // If you had another subscription before, you will not get the free trial again: we use this to show the correct message.
  // Current plan is either FREE_NO_PLAN or FREE_TEST_PLAN if you're on this paywall.
  // FREE_NO_PLAN is not on the database, checking it comes down to having at least 1 subscription.
  const noPreviousSubscription =
    subscriptions.length === 0 ||
    (subscriptions.length === 1 && isOldFreePlan(subscriptions[0].plan.code)); // FREE_TEST_PLAN did not pay, they should be asked to start instead of resume

  return (
    <>
      <BarHeader
        title="Joining Dust"
        className="ml-10 lg:ml-0"
        rightActions={
          <>
            <div className="flex flex-row items-center">
              {user?.organizations && user.organizations.length > 1 && (
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
                        ? "Start your free trial"
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
                        Try the Pro plan for free for two weeks.
                      </span>
                    </Page.P>
                    <Page.P>
                      You will be charged after your trial ends. You can cancel
                      at any time during your trial.
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
                      : `Start your trial with ${billingPeriod} billing`
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
                <Page.Header icon={LockIcon} title="Workspace locked" />
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
