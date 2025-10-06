import { BarHeader, Button, LockIcon, Page } from "@dust-tt/sparkle";
import { CreditCardIcon } from "@heroicons/react/20/solid";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React from "react";

import { ProPlansTable } from "@app/components/plans/ProPlansTable";
import { UserMenu } from "@app/components/UserMenu";
import WorkspacePicker from "@app/components/WorkspacePicker";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import { isOldFreePlan } from "@app/lib/plans/plan_codes";
import { useUser } from "@app/lib/swr/user";
import { useWorkspaceSubscriptions } from "@app/lib/swr/workspaces";
import { trackEvent, TRACKING_AREAS } from "@app/lib/tracking";
import type { BillingPeriod, WorkspaceType } from "@app/types";

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  owner: WorkspaceType;
  isAdmin: boolean;
}>(async (context, auth) => {
  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      isAdmin: auth.isAdmin(),
    },
  };
});

export default function Subscribe({
  owner,
  isAdmin,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const sendNotification = useSendNotification();
  const { user } = useUser();

  const { subscriptions } = useWorkspaceSubscriptions({
    owner,
  });

  const [billingPeriod, setBillingPeriod] =
    React.useState<BillingPeriod>("monthly");

  // If you had another subscription before, you will not get the free trial again: we use this to show the correct message.
  // Current plan is either FREE_NO_PLAN or FREE_TEST_PLAN if you're on this paywall.
  // FREE_NO_PLAN is not on the database, checking it comes down to having at least 1 subscription.
  const noPreviousSubscription =
    subscriptions.length === 0 ||
    (subscriptions.length === 1 && isOldFreePlan(subscriptions[0].plan.code)); // FREE_TEST_PLAN did not pay, they should be asked to start instead of resume

  const { submit: handleSubscribePlan } = useSubmitFunction(
    async (billingPeriod) => {
      const res = await fetch(`/api/w/${owner.sId}/subscriptions`, {
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

  return (
    <>
      <BarHeader
        title="Joining Dust"
        className="ml-10 lg:ml-0"
        rightActions={
          <>
            <div className="flex flex-row items-center">
              {user?.organizations && user.organizations.length > 1 && (
                <WorkspacePicker user={user} workspace={owner} />
              )}
              <div>
                {user && (
                  <UserMenu user={user} owner={owner} subscription={null} />
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
                    noPreviousSubscription
                      ? "Start your free trial"
                      : "Resume your subscription"
                  }
                />
                {!noPreviousSubscription ? (
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
                      ? billingPeriod === "monthly"
                        ? "Resume with monthly billing"
                        : "Resume with yearly billing"
                      : billingPeriod === "monthly"
                        ? "Start your trial with monthly billing"
                        : "Start your trial with yearly billing"
                  }
                  icon={CreditCardIcon}
                  size="sm"
                  onClick={() => {
                    trackEvent(
                      TRACKING_AREAS.AUTH,
                      "subscription_start",
                      "click",
                      {
                        billing_period: billingPeriod,
                        is_trial: noPreviousSubscription ? "true" : "false",
                      }
                    );
                    void handleSubscribePlan(billingPeriod);
                  }}
                />
              </Page.Vertical>
              <Page.Horizontal sizing="grow">
                <ProPlansTable
                  owner={owner}
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
                  owner={owner}
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
