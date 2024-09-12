import {
  Button,
  CardIcon,
  Chip,
  Dialog,
  DropdownMenu,
  MoreIcon,
  Page,
  ShapesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  SubscriptionPerSeatPricing,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type * as t from "io-ts";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useContext, useEffect, useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { PricePlans } from "@app/components/plans/PlansTables";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { SubscriptionContactUsDrawer } from "@app/components/SubscriptionContactUsDrawer";
import { getPriceAsString } from "@app/lib/client/subscription";
import { useSubmitFunction } from "@app/lib/client/utils";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import {
  FREE_TEST_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
  isUpgraded,
} from "@app/lib/plans/plan_codes";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { getPerSeatSubscriptionPricing } from "@app/lib/plans/subscription";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/usage/seats";
import type { PatchSubscriptionRequestBody } from "@app/pages/api/w/[wId]/subscriptions";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
  trialDaysRemaining: number | null;
  workspaceSeats: number;
  perSeatPricing: SubscriptionPerSeatPricing | null;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();
  if (!owner || !auth.isAdmin() || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  let trialDaysRemaining = null;
  if (subscription.trialing && subscription.stripeSubscriptionId) {
    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (!stripeSubscription) {
      return {
        notFound: true,
      };
    }
    stripeSubscription;
    trialDaysRemaining = stripeSubscription.trial_end
      ? Math.ceil(
          (stripeSubscription.trial_end * 1000 - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      : null;
  }

  const workspaceSeats = await countActiveSeatsInWorkspace(owner.sId);
  const perSeatPricing = await getPerSeatSubscriptionPricing(subscription);

  return {
    props: {
      owner,
      subscription,
      trialDaysRemaining,
      user,
      workspaceSeats,
      perSeatPricing,
    },
  };
});

export default function Subscription({
  owner,
  user,
  subscription,
  trialDaysRemaining,
  workspaceSeats,
  perSeatPricing,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const sendNotification = useContext(SendNotificationsContext);
  const [isWebhookProcessing, setIsWebhookProcessing] =
    React.useState<boolean>(false);

  const [showContactUsDrawer, setShowContactUsDrawer] = useState(false);
  const [showSkipFreeTrialDialog, setShowSkipFreeTrialDialog] = useState(false);
  const [showCancelFreeTrialDialog, setShowCancelFreeTrialDialog] =
    useState(false);
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
        body: JSON.stringify({
          billingPeriod: "monthly",
        }),
      });

      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Subscription failed",
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
          router.reload(); // We cannot swr the plan so we just reload the page.
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

  const { submit: skipFreeTrial, isSubmitting: skipFreeTrialIsSubmitting } =
    useSubmitFunction(async () => {
      try {
        const res = await fetch(`/api/w/${owner.sId}/subscriptions`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "pay_now",
          } satisfies t.TypeOf<typeof PatchSubscriptionRequestBody>),
        });
        if (!res.ok) {
          sendNotification({
            type: "error",
            title: "Transition to paid plan failed",
            description: "Failed to transition to paid plan.",
          });
        } else {
          sendNotification({
            type: "success",
            title: "Upgrade successful",
            description: "Redirecting...",
          });
          await new Promise((resolve) => setTimeout(resolve, 3000));
          router.reload();
        }
      } finally {
        setShowSkipFreeTrialDialog(false);
      }
    });

  const { submit: cancelFreeTrial, isSubmitting: cancelFreeTrialSubmitting } =
    useSubmitFunction(async () => {
      try {
        const res = await fetch(`/api/w/${owner.sId}/subscriptions`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "cancel_free_trial",
          } satisfies t.TypeOf<typeof PatchSubscriptionRequestBody>),
        });
        if (!res.ok) {
          sendNotification({
            type: "error",
            title: "Failed to open billing dashboard",
            description: "Failed to open billing dashboard.",
          });
        } else {
          sendNotification({
            type: "success",
            title: "Free trial cancelled",
            description: "Redirecting...",
          });
          await router.push(`/w/${owner.sId}/subscribe`);
        }
      } finally {
        setShowCancelFreeTrialDialog(false);
      }
    });

  const isProcessing = isSubscribingPlan || isGoingToStripePortal;

  const plan = subscription.plan;
  const chipColor = !isUpgraded(plan) ? "emerald" : "sky";

  const onClickProPlan = async () => handleSubscribePlan();
  const onClickEnterprisePlan = () => {
    setShowContactUsDrawer(true);
  };
  const planLabel =
    trialDaysRemaining === null
      ? plan.name
      : `${plan.name}: ${trialDaysRemaining} days of trial remaining`;

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({ owner, current: "subscription" })}
    >
      {perSeatPricing && (
        <>
          <CancelFreeTrialDialog
            show={showCancelFreeTrialDialog}
            onClose={() => setShowCancelFreeTrialDialog(false)}
            onValidate={cancelFreeTrial}
            isSaving={cancelFreeTrialSubmitting}
          />

          <SkipFreeTrialDialog
            plan={subscription.plan}
            show={showSkipFreeTrialDialog}
            onClose={() => {
              setShowSkipFreeTrialDialog(false);
            }}
            onValidate={skipFreeTrial}
            workspaceSeats={workspaceSeats}
            perSeatPricing={perSeatPricing}
            isSaving={skipFreeTrialIsSubmitting}
          />
        </>
      )}

      <SubscriptionContactUsDrawer
        show={showContactUsDrawer}
        onClose={() => {
          setShowContactUsDrawer(false);
        }}
        initialEmail={user.email}
      />
      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Subscription"
          icon={ShapesIcon}
          description="Manage your plan."
        />
        <Page.Vertical align="stretch" gap="md">
          <Page.H variant="h5">Your plan </Page.H>
          <div>
            {isWebhookProcessing ? (
              <Spinner />
            ) : (
              <>
                <Page.Horizontal gap="sm">
                  <Chip size="sm" color={chipColor} label={planLabel} />
                  {!subscription.trialing &&
                    subscription.stripeSubscriptionId && (
                      <DropdownMenu>
                        <DropdownMenu.Button>
                          <Button
                            icon={MoreIcon}
                            variant="tertiary"
                            labelVisible={false}
                            disabledTooltip={true}
                            label=""
                          />
                        </DropdownMenu.Button>
                        <DropdownMenu.Items origin="auto" width={210}>
                          <DropdownMenu.Item
                            label="Manage my subscription"
                            onClick={handleGoToStripePortal}
                          />
                        </DropdownMenu.Items>
                      </DropdownMenu>
                    )}
                </Page.Horizontal>
              </>
            )}
          </div>
          {perSeatPricing && subscription.trialing && (
            <Page.Vertical>
              <Page.Horizontal gap="sm">
                <Button
                  onClick={() => setShowSkipFreeTrialDialog(true)}
                  label="End trial & get full access"
                />
                <Button
                  label="Cancel subscription"
                  variant="tertiary"
                  onClick={() => setShowCancelFreeTrialDialog(true)}
                />
              </Page.Horizontal>
            </Page.Vertical>
          )}
          <div className="h-4"></div>
          {subscription.stripeSubscriptionId && (
            <Page.Vertical gap="sm">
              <Page.H variant="h5">Billing</Page.H>
              {perSeatPricing !== null && (
                <>
                  <Page.P>
                    Estimated {perSeatPricing.billingPeriod} billing:{" "}
                    <span className="font-bold">
                      {getPriceAsString({
                        currency: perSeatPricing.seatCurrency,
                        priceInCents: perSeatPricing.seatPrice * workspaceSeats,
                      })}
                    </span>{" "}
                    (excluding taxes).
                  </Page.P>
                  <Page.P>
                    {workspaceSeats === 1 ? (
                      <>
                        {workspaceSeats} member,{" "}
                        {getPriceAsString({
                          currency: perSeatPricing.seatCurrency,
                          priceInCents: perSeatPricing.seatPrice,
                        })}{" "}
                        per member.
                      </>
                    ) : (
                      <>
                        {workspaceSeats} members,{" "}
                        {getPriceAsString({
                          currency: perSeatPricing.seatCurrency,
                          priceInCents: perSeatPricing.seatPrice,
                        })}{" "}
                        per member.
                      </>
                    )}
                  </Page.P>
                </>
              )}
              <div className="my-5">
                <Button
                  icon={CardIcon}
                  label="Your billing dashboard on Stripe"
                  variant="tertiary"
                  onClick={handleGoToStripePortal}
                />
              </div>
            </Page.Vertical>
          )}
          {!plan ||
            ([FREE_TEST_PLAN_CODE, FREE_UPGRADED_PLAN_CODE].includes(
              plan.code
            ) && (
              <>
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
                      display="subscribe"
                    />
                    <PricePlans
                      size="xs"
                      flexCSS="gap-3"
                      className="hidden lg:flex"
                      plan={plan}
                      onClickProPlan={onClickProPlan}
                      onClickEnterprisePlan={onClickEnterprisePlan}
                      isProcessing={isProcessing}
                      display="subscribe"
                    />
                  </div>
                </div>
                <Link href="/terms" target="_blank" className="text-sm">
                  Terms of use apply to all plans.
                </Link>
              </>
            ))}
        </Page.Vertical>
      </Page.Vertical>
      <div className="h-12" />
    </AppLayout>
  );
}

function SkipFreeTrialDialog({
  show,
  onClose,
  onValidate,
  workspaceSeats,
  perSeatPricing,
  isSaving,
  plan,
}: {
  show: boolean;
  onClose: () => void;
  onValidate: () => void;
  workspaceSeats: number;
  perSeatPricing: SubscriptionPerSeatPricing;
  isSaving: boolean;
  plan: SubscriptionType["plan"];
}) {
  return (
    <Dialog
      isOpen={show}
      title={`End trial`}
      onCancel={onClose}
      validateLabel="End trial & get full access"
      validateVariant="primary"
      onValidate={() => {
        onValidate();
      }}
      isSaving={isSaving}
    >
      <Page.Vertical gap="md">
        <Page.P>
          Ending your trial will allow you to invite more than{" "}
          {plan.limits.users.maxUsers} members to your workspace.
        </Page.P>
        <Page.P>
          {(() => {
            if (workspaceSeats === 1) {
              return (
                <>
                  Billing will start immediately for your workspace. <br />
                  Currently: {workspaceSeats} member,{" "}
                  {getPriceAsString({
                    currency: perSeatPricing.seatCurrency,
                    priceInCents: perSeatPricing.seatPrice,
                  })}
                  monthly (excluding taxes).
                </>
              );
            }
            return (
              <>
                Billing will start immediately for your workspace:.
                <br />
                Currently: {workspaceSeats} members,{" "}
                {getPriceAsString({
                  currency: perSeatPricing.seatCurrency,
                  priceInCents: perSeatPricing.seatPrice,
                })}
                monthly (excluding taxes).
              </>
            );
          })()}
        </Page.P>
      </Page.Vertical>
    </Dialog>
  );
}

function CancelFreeTrialDialog({
  show,
  onClose,
  onValidate,
  isSaving,
}: {
  show: boolean;
  onClose: () => void;
  onValidate: () => Promise<void>;
  isSaving: boolean;
}) {
  return (
    <Dialog
      isOpen={show}
      title={`Cancel subscription`}
      onCancel={onClose}
      validateLabel="Yes, cancel subscription"
      validateVariant="primaryWarning"
      onValidate={onValidate}
      isSaving={isSaving}
    >
      <Page.Vertical gap="md">
        <Page.P>
          <span className="font-bold">
            All your workspace data will be deleted and you will lose access to
            your Dust workspace.
          </span>
        </Page.P>

        <Page.P>Are you sure you want to cancel ?</Page.P>
      </Page.Vertical>
    </Dialog>
  );
}
