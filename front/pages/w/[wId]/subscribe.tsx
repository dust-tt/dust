import { BarHeader, Button, LockIcon, Page } from "@dust-tt/sparkle";
import type { BillingPeriod, WorkspaceType } from "@dust-tt/types";
import { CreditCardIcon } from "@heroicons/react/20/solid";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React, { useContext, useEffect } from "react";

import { ProPlansTable } from "@app/components/plans/ProPlansTable";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { UserMenu } from "@app/components/UserMenu";
import WorkspacePicker from "@app/components/WorkspacePicker";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthPaywallWhitelisted } from "@app/lib/iam/session";
import { useUser } from "@app/lib/swr/user";
import { useWorkspaceSubscriptions } from "@app/lib/swr/workspaces";
import { ClientSideTracking } from "@app/lib/tracking/client";

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
  const sendNotification = useContext(SendNotificationsContext);
  const { user } = useUser();

  const { subscriptions } = useWorkspaceSubscriptions({
    workspaceId: owner.sId,
  });

  const [billingPeriod, setBillingPeriod] =
    React.useState<BillingPeriod>("monthly");

  // If you had another subscription before, you will not get the free trial again: we use this to show the correct message.
  // Current plan is always FREE_NO_PLAN if you're on this paywall.
  // Since FREE_NO_PLAN is not on the database, we check if there is at least 1 subscription.
  const hasPreviouSubscription = subscriptions?.length > 0;

  useEffect(() => {
    if (user?.id) {
      ClientSideTracking.trackPageView({
        user,
        pathname: router.pathname,
        workspaceId: owner.sId,
      });
    }
  }, [owner.sId, router.pathname, user]);

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
      <div className="mb-10">
        <BarHeader
          title={"Joining Dust"}
          className="ml-10 lg:ml-0"
          rightActions={
            <>
              <div className="flex flex-row items-center">
                {user && user.workspaces.length > 1 && (
                  <div className="mr-4 flex flex-row gap-2">
                    <div className="text-sm text-slate-500">Workspace:</div>
                    <WorkspacePicker
                      user={user}
                      workspace={owner}
                      readOnly={false}
                      displayDropDownOrigin="topRight"
                      onWorkspaceUpdate={(workspace) => {
                        const assistantRoute = `/w/${workspace.sId}/assistant/new`;
                        if (workspace.id !== owner.id) {
                          void router
                            .push(assistantRoute)
                            .then(() => router.reload());
                        }
                      }}
                    />
                  </div>
                )}
                <div>{user && <UserMenu user={user} owner={owner} />}</div>
              </div>
            </>
          }
        />
      </div>
      <Page>
        <div className="flex h-full flex-col justify-center">
          {isAdmin ? (
            <Page.Horizontal>
              <Page.Vertical sizing="grow" gap="lg">
                <Page.Header
                  icon={CreditCardIcon}
                  title="Setting up your subscription"
                />
                {hasPreviouSubscription ? (
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
                    hasPreviouSubscription
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
                    void handleSubscribePlan(billingPeriod);
                  }}
                ></Button>
              </Page.Vertical>
              <Page.Horizontal sizing="grow">
                <ProPlansTable
                  size="xs"
                  display="subscribe"
                  setBillingPeriod={setBillingPeriod}
                ></ProPlansTable>
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
                  size="xs"
                  display="subscribe"
                  setBillingPeriod={setBillingPeriod}
                ></ProPlansTable>
              </Page.Vertical>
            </Page.Horizontal>
          )}
        </div>
      </Page>
    </>
  );
}
