import {
  Button,
  Chip,
  ExternalLinkIcon,
  Page,
  PageHeader,
  ShapesIcon,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import router from "next/router";
import React, { useContext } from "react";

import { PricePlans } from "@app/components/PlansTables";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { PlanType } from "@app/types/plan";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  plan: PlanType;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !auth.isAdmin() || !plan) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      plan,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function Subscription({
  user,
  owner,
  plan,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const sendNotification = useContext(SendNotificationsContext);
  const [isProcessing, setIsProcessing] = React.useState<boolean>(false);

  async function handleSubscribeToPlan(planCode: string): Promise<void> {
    setIsProcessing(true);
    const res = await fetch(`/api/w/${owner.sId}/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        planCode,
      }),
    });
    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Subscribtion failed",
        description: "Failed to subscribe to a new plan.",
      });
    } else {
      const content = await res.json();
      if (content.checkoutUrl) {
        await router.push(content.checkoutUrl);
      } else if (content.success) {
        await router.reload(); // We cannot swr the plan so we just reload the page.
      }
    }
    setIsProcessing(false);
  }

  async function handleGoToStripePortal(): Promise<void> {
    setIsProcessing(true);
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
    setIsProcessing(false);
  }

  const chipColor = plan.code === "FREE_TEST_PLAN" ? "emerald" : "sky";

  const onClickProPlan = async () =>
    await handleSubscribeToPlan("PRO_PLAN_SEAT_29");
  const onClickEnterprisePlan = () => {
    window.open("mailto:team@dust.tt?subject=Upgrading to Enteprise plan");
  };

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "subscription" })}
    >
      <Page.Vertical gap="xl" align="stretch">
        <PageHeader
          title="Subscription"
          icon={ShapesIcon}
          description="Choose the plan that works for you."
        />
        <Page.Vertical align="stretch" gap="md">
          <div className="flex">
            <div className="flex-1">
              <Page.H variant="h5">Your plan </Page.H>
              <div className="pt-2">
                You're on&nbsp;&nbsp;
                <Chip size="sm" color={chipColor} label={plan.name} />
              </div>
            </div>
            <div className="flex-1">
              {plan.stripeCustomerId && (
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
          <div className="pt-2">
            <Page.H variant="h5">Manage my plan</Page.H>
            <div className="s-h-full s-w-full pt-2">
              <PricePlans
                size="xs"
                className="xl:hidden"
                isTabs
                plan={plan}
                onClickProPlan={onClickProPlan}
                onClickEnterprisePlan={onClickEnterprisePlan}
                isProcessing={isProcessing}
              />
              <PricePlans
                size="xs"
                className="hidden xl:flex"
                plan={plan}
                onClickProPlan={onClickProPlan}
                onClickEnterprisePlan={onClickEnterprisePlan}
                isProcessing={isProcessing}
              />
            </div>
          </div>
        </Page.Vertical>
      </Page.Vertical>
    </AppLayout>
  );
}
