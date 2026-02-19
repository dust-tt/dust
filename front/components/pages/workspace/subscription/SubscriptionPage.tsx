import { SubscriptionPlanCards } from "@app/components/plans/SubscriptionPlanCards";
import { useSendNotification } from "@app/hooks/useNotification";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { getPriceAsString } from "@app/lib/client/subscription";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import {
  isProPlan,
  isUpgraded,
  isWhitelistedBusinessPlan,
} from "@app/lib/plans/plan_codes";
import { LinkWrapper, useAppRouter, useSearchParam } from "@app/lib/platform";
import {
  usePerSeatPricing,
  useSubscriptionTrialInfo,
  useWorkspaceSeatsCount,
} from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { PatchSubscriptionRequestBody } from "@app/pages/api/w/[wId]/subscriptions";
import type {
  BillingPeriod,
  SubscriptionPerSeatPricing,
  SubscriptionType,
} from "@app/types/plan";
import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  CardIcon,
  Chip,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Page,
  ShapesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type * as t from "io-ts";
import React, { useEffect, useState } from "react";

interface SkipFreeTrialDialogProps {
  show: boolean;
  onClose: () => void;
  onValidate: () => void;
  workspaceSeats: number;
  perSeatPricing: SubscriptionPerSeatPricing;
  isSaving: boolean;
  plan: SubscriptionType["plan"];
}

function SkipFreeTrialDialog({
  show,
  onClose,
  onValidate,
  workspaceSeats,
  perSeatPricing,
  isSaving,
  plan,
}: SkipFreeTrialDialogProps) {
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
          <DialogTitle>End trial</DialogTitle>
          <DialogDescription>
            Ending your trial will allow you to invite more than{" "}
            {plan.limits.users.maxUsers} members to your workspace.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          {isSaving ? (
            <div className="flex justify-center py-8">
              <Spinner variant="dark" size="md" />
            </div>
          ) : (
            (() => {
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
            })()
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "End trial & get full access",
            variant: "primary",
            onClick: onValidate,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface CancelFreeTrialDialogProps {
  show: boolean;
  onClose: () => void;
  onValidate: () => Promise<void>;
  isSaving: boolean;
}

function CancelFreeTrialDialog({
  show,
  onClose,
  onValidate,
  isSaving,
}: CancelFreeTrialDialogProps) {
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
            All your workspace data will be deleted and you will lose access to
            your Dust workspace.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          {isSaving ? (
            <div className="flex justify-center py-8">
              <Spinner variant="dark" size="md" />
            </div>
          ) : (
            <div className="font-bold">Are you sure you want to proceed?</div>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
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
  const { subscription } = useAuth();
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const type = useSearchParam("type");
  const planCode = useSearchParam("plan_code");
  const [isWebhookProcessing, setIsWebhookProcessing] =
    React.useState<boolean>(false);

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [showSkipFreeTrialDialog, setShowSkipFreeTrialDialog] = useState(false);
  const [showCancelFreeTrialDialog, setShowCancelFreeTrialDialog] =
    useState(false);

  const { trialDaysRemaining, isTrialInfoLoading } = useSubscriptionTrialInfo({
    workspaceId: owner.sId,
  });
  const { seatsCount: workspaceSeats, isSeatsCountLoading } =
    useWorkspaceSeatsCount({ workspaceId: owner.sId });
  const { perSeatPricing, isPerSeatPricingLoading } = usePerSeatPricing({
    workspaceId: owner.sId,
  });

  const isLoading =
    isTrialInfoLoading || isSeatsCountLoading || isPerSeatPricingLoading;

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
      const res = await clientFetch(`/api/w/${owner.sId}/subscriptions`, {
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
      } satisfies t.TypeOf<typeof PatchSubscriptionRequestBody>),
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

  const { submit: skipFreeTrial, isSubmitting: skipFreeTrialIsSubmitting } =
    useSubmitFunction(async () => {
      try {
        const res = await clientFetch(`/api/w/${owner.sId}/subscriptions`, {
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
        const res = await clientFetch(`/api/w/${owner.sId}/subscriptions`, {
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
          await router.push(`/w/${owner.sId}/subscription`);
        }
      } finally {
        setShowCancelFreeTrialDialog(false);
      }
    });

  const plan = subscription.plan;
  const isWorkspaceOnProPlan = isProPlan(plan);
  const isWorkspaceWhitelistedBusinessPlan = isWhitelistedBusinessPlan(owner);
  const canUpsellToBusinessPlan =
    isWorkspaceOnProPlan && isWorkspaceWhitelistedBusinessPlan;

  const isProcessing =
    isSubscribingPlan || isGoingToStripePortal || isUpgradingToBusiness;

  const chipColor = !isUpgraded(plan) ? "green" : "blue";

  const planLabel =
    trialDaysRemaining === null
      ? plan.name
      : `${plan.name}: ${trialDaysRemaining} days of trial remaining`;

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
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
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

      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Subscription"
          icon={ShapesIcon}
          description="Manage your plan."
        />
        <Page.Vertical align="stretch" gap="md">
          <Page.H variant="h5">Your plan </Page.H>

          {endDate && (
            <ContentMessage
              title={`Your subscription ends on ${endDate}.`}
              variant="warning"
            >
              <>
                Connections will be deleted and members will be revoked. Details{" "}
                <LinkWrapper
                  href="https://docs.dust.tt/docs/subscriptions#what-happens-when-we-cancel-our-dust-subscription"
                  target="_blank"
                  className="underline"
                >
                  here
                </LinkWrapper>
                .
              </>
            </ContentMessage>
          )}

          <div>
            {isWebhookProcessing ? (
              <Spinner />
            ) : (
              <>
                <Page.Horizontal gap="sm">
                  <Chip size="sm" color={chipColor} label={planLabel} />
                  {!subscription.trialing &&
                    subscription.stripeSubscriptionId && (
                      <Button
                        label="Manage my subscription"
                        onClick={withTracking(
                          TRACKING_AREAS.AUTH,
                          "subscription_manage",
                          () => {
                            void handleGoToStripePortal();
                          }
                        )}
                        variant="outline"
                      />
                    )}
                </Page.Horizontal>
              </>
            )}
          </div>
          {perSeatPricing && subscription.trialing && (
            <Page.Vertical>
              <Page.Horizontal gap="sm">
                <Button
                  onClick={withTracking(
                    TRACKING_AREAS.AUTH,
                    "subscription_skip_trial",
                    () => {
                      setShowSkipFreeTrialDialog(true);
                    }
                  )}
                  label="End trial & get full access"
                />
                <Button
                  label="Cancel subscription"
                  variant="ghost"
                  onClick={withTracking(
                    TRACKING_AREAS.AUTH,
                    "subscription_cancel_trial",
                    () => {
                      setShowCancelFreeTrialDialog(true);
                    }
                  )}
                />
              </Page.Horizontal>
            </Page.Vertical>
          )}
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
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Page.H variant="h5">Choose a plan</Page.H>
                  <Page.P>Pick a plan that best suits your team.</Page.P>
                </div>
                <ButtonsSwitchList
                  defaultValue={billingPeriod}
                  size="xs"
                  onValueChange={(v) => {
                    if (v === "monthly" || v === "yearly") {
                      setBillingPeriod(v);
                    }
                  }}
                >
                  <ButtonsSwitch value="monthly" label="Monthly billing" />
                  <ButtonsSwitch value="yearly" label="Yearly billing" />
                </ButtonsSwitchList>
              </div>
              <div className="pt-4">
                <SubscriptionPlanCards
                  billingPeriod={billingPeriod}
                  onSubscribe={handleSubscribePlan}
                  isProcessing={isProcessing}
                />
              </div>
            </div>
          )}
        </Page.Vertical>
      </Page.Vertical>
      <div className="h-12" />
    </>
  );
}
