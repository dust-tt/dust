import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import type { PaidPlanTier } from "@app/components/pages/onboarding/SubscriptionPlans";
import {
  BillingPeriodSwitch,
  PaidPlanCards,
} from "@app/components/pages/onboarding/SubscriptionPlans";
import { SubscriptionPlanCards } from "@app/components/plans/SubscriptionPlanCards";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  useCancelWorkspaceSubscription,
  useResumeWorkspaceSubscription,
} from "@app/hooks/useWorkspaceSubscriptionCancellation";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import {
  getPriceAsString,
  useIsMetronomeCheckout,
} from "@app/lib/client/subscription";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import {
  isEnterprisePlanPrefix,
  isProOrBusinessPlanCode,
  isProPlan,
  isUpgraded,
  isWhitelistedBusinessPlan,
} from "@app/lib/plans/plan_codes";
import { LinkWrapper, useAppRouter, useSearchParam } from "@app/lib/platform";
import {
  usePerSeatPricing,
  useWorkspaceSeatsCount,
} from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { PatchSubscriptionRequestBody } from "@app/types/api/subscription";
import type { BillingPeriod } from "@app/types/plan";
import { isCreditPricedPlan } from "@app/types/plan";
import {
  Button,
  Chip,
  ContentMessage,
  CreditCard01,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useEffect, useState } from "react";
import type { z } from "zod";

interface CancelSubscriptionDialogProps {
  show: boolean;
  onClose: () => void;
  onValidate: () => Promise<void>;
  isSaving: boolean;
}

function CancelSubscriptionDialog({
  show,
  onClose,
  onValidate,
  isSaving,
}: CancelSubscriptionDialogProps) {
  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
          <DialogDescription>
            Your subscription will end at the end of your current billing
            period.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          {isSaving ? (
            <div className="flex justify-center py-8">
              <Spinner variant="dark" size="md" />
            </div>
          ) : (
            <div>Are you sure you want to proceed?</div>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Keep subscription",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Yes, cancel subscription",
            variant: "warning",
            onClick: onValidate,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function SubscriptionPage() {
  const owner = useWorkspace();
  const { subscription, user: authUser } = useAuth();
  const isMetronomeCheckout = useIsMetronomeCheckout();
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const type = useSearchParam("type");
  const planCode = useSearchParam("plan_code");
  const [isWebhookProcessing, setIsWebhookProcessing] =
    React.useState<boolean>(false);

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [showCancelSubscriptionDialog, setShowCancelSubscriptionDialog] =
    useState(false);

  const { seatsCount: workspaceSeats, isSeatsCountLoading } =
    useWorkspaceSeatsCount({ workspaceId: owner.sId });
  const { perSeatPricing, isPerSeatPricingLoading } = usePerSeatPricing({
    workspaceId: owner.sId,
  });

  const isLoading = isSeatsCountLoading || isPerSeatPricingLoading;

  const isCreditPriced = isCreditPricedPlan(subscription.plan);
  useEffect(() => {
    if (isCreditPriced) {
      void router.replace(`/w/${owner.sId}/billing`);
    }
  }, [isCreditPriced, owner.sId, router]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useEffect(() => {
    if (type === "succeeded") {
      if (subscription.plan.code === planCode) {
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
      await router.push(
        `/w/${owner.sId}/subscription/checkout?billingPeriod=${billingPeriod}`
      );
    });

  const { submit: handleSubscribeMetronome } = useSubmitFunction(
    async (seatType: PaidPlanTier) => {
      const query = new URLSearchParams({
        seatType,
        billingPeriod,
        targetUserId: authUser.sId,
      });
      await router.push(
        `/w/${owner.sId}/subscription/checkout?${query.toString()}`
      );
    }
  );

  const {
    submit: handleGoToStripePortal,
    isSubmitting: isGoingToStripePortal,
  } = useSubmitFunction(async () => {
    window.open(`/w/${owner.sId}/subscription/manage`, "_blank");
  });

  const {
    submit: handleUpgradeToBusiness,
    isSubmitting: isUpgradingToBusiness,
  } = useSubmitFunction(async () => {
    const res = await clientFetch(`/api/w/${owner.sId}/subscriptions`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "upgrade_to_business",
      } satisfies z.infer<typeof PatchSubscriptionRequestBody>),
    });

    if (!res.ok) {
      sendNotification({
        type: "error",
        title: "Upgrade failed",
        description: "Failed to upgrade to Enterprise seat-based plan.",
      });
    } else {
      sendNotification({
        type: "success",
        title: "Upgrade successful",
        description:
          "Your workspace has been upgraded to Enterprise seat-based plan.",
      });
      router.reload();
    }
  });

  const plan = subscription.plan;
  const isWorkspaceOnProOrBusinessPlan = isProOrBusinessPlanCode(plan);

  const { cancelSubscription, isCancellingSubscription } =
    useCancelWorkspaceSubscription({ workspaceId: owner.sId });
  const { resumeSubscription, isResumingSubscription } =
    useResumeWorkspaceSubscription({ workspaceId: owner.sId });

  if (isCreditPriced) {
    return null;
  }

  const isWorkspaceWhitelistedBusinessPlan = isWhitelistedBusinessPlan(owner);
  // Only legacy Pro can upsell to Business; a Business (SEAT_39) workspace is
  // already there.
  const canUpsellToBusinessPlan =
    isProPlan(plan) &&
    isWorkspaceWhitelistedBusinessPlan &&
    !isMetronomeCheckout;

  // Cancelled (churning at the end date).
  const isCancelled = subscription.endDate !== null;

  // A Stripe-billed Pro or Business workspace can cancel while active. Not when
  // already cancelled (→ Resume).
  const canCancelSubscription =
    isWorkspaceOnProOrBusinessPlan &&
    subscription.stripeSubscriptionId !== null &&
    !isCancelled;
  // Cancelled but not yet ended — resume clears the scheduled cancellation.
  const canResumeSubscription =
    isWorkspaceOnProOrBusinessPlan &&
    isCancelled &&
    subscription.endDate !== null &&
    new Date(subscription.endDate).getTime() > Date.now();

  const handleCancelSubscription = async () => {
    const ok = await cancelSubscription();
    if (ok) {
      setShowCancelSubscriptionDialog(false);
      router.reload();
    }
  };
  const handleResumeSubscription = async () => {
    const ok = await resumeSubscription();
    if (ok) {
      router.reload();
    }
  };

  const isProcessing =
    isSubscribingPlan || isGoingToStripePortal || isUpgradingToBusiness;

  const chipColor = !isUpgraded(plan) ? "success" : "highlight";

  const planLabel = plan.name;

  const displayPricingTable = subscription.stripeSubscriptionId === null;

  const endDate = subscription.endDate
    ? new Date(subscription.endDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  if (isLoading) {
    return (
      <AdminPageContainer>
        <div className="flex h-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      </AdminPageContainer>
    );
  }

  return (
    <AdminPageContainer>
      <>
        {(isCancellingSubscription || isResumingSubscription) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 dark:bg-black/60">
            <Spinner size="lg" />
          </div>
        )}
        {perSeatPricing && (
          <CancelSubscriptionDialog
            show={showCancelSubscriptionDialog}
            onClose={() => setShowCancelSubscriptionDialog(false)}
            onValidate={handleCancelSubscription}
            isSaving={isCancellingSubscription}
          />
        )}

        <Page.Vertical gap="xl" align="stretch">
          <Page.Header title="Subscription" description="Manage your plan." />
          <Page.Vertical align="stretch" gap="md">
            <Page.H variant="h5">Your plan </Page.H>

            {isCancelled && endDate && (
              <ContentMessage
                title={`Your subscription ends on ${endDate}.`}
                variant="warning"
              >
                {isEnterprisePlanPrefix(plan.code) ? (
                  <>
                    Please reach out to your account manager to ensure
                    continuity.
                  </>
                ) : (
                  <>
                    Connections will be deleted and members will be revoked.
                    Details{" "}
                    <LinkWrapper
                      href="https://docs.dust.tt/docs/subscriptions#what-happens-when-we-cancel-our-dust-subscription"
                      target="_blank"
                      className="underline"
                    >
                      here
                    </LinkWrapper>
                    .
                  </>
                )}
              </ContentMessage>
            )}
            <>
              <div>
                {isWebhookProcessing ? (
                  <Spinner />
                ) : (
                  <>
                    <Page.Horizontal gap="sm">
                      <Chip size="sm" color={chipColor} label={planLabel} />
                      {canCancelSubscription && (
                        <Button
                          label="Cancel subscription"
                          variant="outline"
                          disabled={isCancellingSubscription}
                          onClick={() => {
                            setShowCancelSubscriptionDialog(true);
                          }}
                        />
                      )}
                      {canResumeSubscription && (
                        <Button
                          label="Resume subscription"
                          variant="primary"
                          disabled={isResumingSubscription}
                          onClick={() => {
                            void handleResumeSubscription();
                          }}
                        />
                      )}
                    </Page.Horizontal>
                  </>
                )}
              </div>
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
                            priceInCents:
                              perSeatPricing.seatPrice * workspaceSeats,
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
                      icon={CreditCard01}
                      label="Your billing dashboard on Stripe"
                      variant="ghost"
                      onClick={withTracking(
                        TRACKING_AREAS.AUTH,
                        "subscription_stripe_portal",
                        () => {
                          void handleGoToStripePortal();
                        }
                      )}
                    />
                  </div>
                </Page.Vertical>
              )}
              {canUpsellToBusinessPlan && (
                <Page.Vertical gap="sm">
                  <Page.H variant="h5">Upgrade your plan</Page.H>
                  <Page.P>
                    You are eligible to upgrade to the Enteprise seat-based plan
                    with additional features.
                  </Page.P>
                  <div>
                    <Button
                      label="Upgrade to Enterprise seat-based plan"
                      variant="primary"
                      disabled={isProcessing}
                      onClick={withTracking(
                        TRACKING_AREAS.AUTH,
                        "subscription_upgrade_to_business",
                        () => {
                          void handleUpgradeToBusiness();
                        }
                      )}
                    />
                  </div>
                </Page.Vertical>
              )}
              {displayPricingTable && (
                <div className="pt-2">
                  {isMetronomeCheckout ? (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <Page.H variant="h5">Choose a plan</Page.H>
                        <BillingPeriodSwitch
                          defaultValue={billingPeriod}
                          onValueChange={setBillingPeriod}
                        />
                      </div>
                      <div className="flex w-full flex-col gap-4 pt-4 sm:flex-row">
                        <PaidPlanCards
                          billingPeriod={billingPeriod}
                          onSubscribe={(seatType) =>
                            void handleSubscribeMetronome(seatType)
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <Page.H variant="h5">Choose a plan</Page.H>
                          <Page.P>
                            Pick a plan that best suits your team.
                          </Page.P>
                        </div>
                        {!isWorkspaceWhitelistedBusinessPlan && (
                          <BillingPeriodSwitch
                            defaultValue={billingPeriod}
                            onValueChange={setBillingPeriod}
                          />
                        )}
                      </div>
                      <div className="pt-4">
                        <SubscriptionPlanCards
                          billingPeriod={billingPeriod}
                          onSubscribe={handleSubscribePlan}
                          isProcessing={isProcessing}
                          owner={owner}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          </Page.Vertical>
        </Page.Vertical>
        <div className="h-12" />
      </>
    </AdminPageContainer>
  );
}
