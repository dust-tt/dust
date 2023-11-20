import {
  Button,
  Chip,
  ExternalLinkIcon,
  Page,
  ShapesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React, { useContext, useEffect } from "react";

import { PricePlans } from "@app/components/PlansTables";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useSubmitFunction } from "@app/lib/client/utils";
import {
  FREE_TEST_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
} from "@app/lib/plans/plan_codes";
import { getPlanInvitation } from "@app/lib/plans/subscription";
import { PlanInvitationType, SubscriptionType } from "@app/types/plan";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  planInvitation: PlanInvitationType | null;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const subscription = auth.subscription();
  if (!owner || !auth.isAdmin() || !subscription) {
    return {
      notFound: true,
    };
  }

  const planInvitation = await getPlanInvitation(auth);

  return {
    props: {
      user,
      owner,
      subscription,
      planInvitation: planInvitation,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function Subscription({
  user,
  owner,
  subscription,
  planInvitation,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);
  const [isWebhookProcessing, setIsWebhookProcessing] =
    React.useState<boolean>(false);

  useEffect(() => {
    if (router.query.type === "succeeded") {
      if (subscription.plan.code === router.query.plan_code) {
        sendNotification({
          type: "success",
          title: `Subscription to ${subscription.plan.name}`,
          description: `Your subscription to ${subscription.plan.name} is now active. Thank you for your trust.`,
        });
        // Then we remove the query params to avoid going through this logic again.
        void router.push(
          { pathname: `/w/${owner.sId}/subscription` },
          undefined,
          {
            shallow: true,
          }
        );
      } else {
        // If the Stripe webhook is not yet received, we try waiting for it and reload the page every 5 seconds until it's done.
        setIsWebhookProcessing(true);
        setTimeout(() => {
          void router.reload();
        }, 5000);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally passing an empty dependency array to execute only once

  const { submit: handleSubscribePlan, isSubmitting: isSubscribingPlan } =
    useSubmitFunction(async () => {
      const res = await fetch(`/api/w/${owner.sId}/subscriptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Subscribtion failed",
          description: "Failed to subscribe to a new plan.",
        });
        // Then we remove the query params to avoid going through this logic again.
        void router.push(
          { pathname: `/w/${owner.sId}/subscription` },
          undefined,
          {
            shallow: true,
          }
        );
      } else {
        const content = await res.json();
        if (content.checkoutUrl) {
          await router.push(content.checkoutUrl);
        } else if (content.success) {
          await router.reload(); // We cannot swr the plan so we just reload the page.
        }
      }
    });

  const {
    submit: handleGoToStripePortal,
    isSubmitting: isGoingToStripePortal,
  } = useSubmitFunction(async () => {
    const res = await fetch("/api/stripe/portal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId: owner.sId,
      }),
    });
    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Failed to open billing dashboard",
        description: "Failed to open billing dashboard.",
      });
    } else {
      const content = await res.json();
      if (content.portalUrl) {
        window.open(content.portalUrl, "_blank");
      }
    }
  });

  const isProcessing = isSubscribingPlan || isGoingToStripePortal;

  const plan = subscription.plan;
  const chipColor = plan.code === FREE_TEST_PLAN_CODE ? "emerald" : "sky";

  const onClickProPlan = async () => await handleSubscribePlan();
  const onClickEnterprisePlan = () => {
    window.open("mailto:team@dust.tt?subject=Upgrading to Enteprise plan");
  };
  const onSubscribeEnterprisePlan = async () => {
    if (!planInvitation) {
      throw new Error("Unreachable: No plan invitation");
    }
    await handleSubscribePlan();
  };

  return (
    <AppLayout
      subscription={subscription}
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "subscription" })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Subscription"
          icon={ShapesIcon}
          description="Manage and discover Dust plans."
        />
        {!planInvitation ? (
          <Page.Vertical align="stretch" gap="md">
            <div className="flex">
              <div className="flex-1">
                <Page.H variant="h5">Your plan </Page.H>
                <div className="pt-2">
                  {isWebhookProcessing ? (
                    <Spinner />
                  ) : (
                    <>
                      You're on&nbsp;&nbsp;
                      <Chip size="sm" color={chipColor} label={plan.name} />
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1">
                {subscription.stripeCustomerId && (
                  <>
                    <Page.H variant="h5">Payment, invoicing & billing</Page.H>
                    <div className="pt-2">
                      <Button
                        icon={ExternalLinkIcon}
                        size="sm"
                        variant="secondary"
                        label="Visit Dust's dashboard on Stripe"
                        disabled={isProcessing}
                        onClick={async () => await handleGoToStripePortal()}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
            {!plan ||
              ([
                FREE_TEST_PLAN_CODE,
                PRO_PLAN_SEAT_29_CODE,
                FREE_UPGRADED_PLAN_CODE,
              ].includes(plan.code) && (
                <div className="pt-2">
                  <Page.H variant="h5">Manage my plan</Page.H>
                  <div className="s-h-full s-w-full pt-2">
                    <PricePlans
                      size="xs"
                      className="lg:hidden"
                      isTabs
                      plan={plan}
                      onClickProPlan={onClickProPlan}
                      onClickEnterprisePlan={onClickEnterprisePlan}
                      isProcessing={isProcessing}
                    />
                    <PricePlans
                      size="xs"
                      flexCSS="gap-3"
                      className="hidden lg:flex"
                      plan={plan}
                      onClickProPlan={onClickProPlan}
                      onClickEnterprisePlan={onClickEnterprisePlan}
                      isProcessing={isProcessing}
                    />
                  </div>
                </div>
              ))}
          </Page.Vertical>
        ) : (
          <Page.Vertical>
            <div>
              You have been invited to the <b>{planInvitation.planName}</b>{" "}
              enterprise plan.
            </div>
            <Button label="Subscribe" onClick={onSubscribeEnterprisePlan} />
          </Page.Vertical>
        )}
      </Page.Vertical>
      <div className="h-12" />
    </AppLayout>
  );
}
