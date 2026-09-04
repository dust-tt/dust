import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import type { PaidPlanTier } from "@app/components/pages/onboarding/SubscriptionPlans";
import {
  BillingPeriodSwitch,
  PaidPlanCards,
} from "@app/components/pages/onboarding/SubscriptionPlans";
import { SubscriptionPlanCards } from "@app/components/plans/SubscriptionPlanCards";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  useCancelWorkspaceMigration,
  useResumeWorkspaceMigration,
  useWorkspaceMigration,
} from "@app/hooks/useWorkspaceMigration";
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
  useSubscriptionTrialInfo,
  useWorkspaceSeatsCount,
} from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { PatchSubscriptionRequestBody } from "@app/types/api/subscription";
import type {
  BillingPeriod,
  SubscriptionPerSeatPricing,
  SubscriptionType,
} from "@app/types/plan";
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

interface CancelMigrationDialogProps {
  show: boolean;
  onClose: () => void;
  onValidate: () => Promise<void>;
  isSaving: boolean;
  billingPeriod: BillingPeriod | undefined;
}

function CancelMigrationDialog({
  show,
  onClose,
  onValidate,
  isSaving,
  billingPeriod,
}: CancelMigrationDialogProps) {
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
            {billingPeriod === "yearly"
              ? "Your subscription will end on the scheduled migration date " +
                "instead of continuing to your yearly renewal."
              : "Your subscription will end at the end of your current " +
                "billing period."}
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
  const [showSkipFreeTrialDialog, setShowSkipFreeTrialDialog] = useState(false);
  const [showCancelFreeTrialDialog, setShowCancelFreeTrialDialog] =
    useState(false);
  const [showCancelMigrationDialog, setShowCancelMigrationDialog] =
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
          } satisfies z.infer<typeof PatchSubscriptionRequestBody>),
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
          } satisfies z.infer<typeof PatchSubscriptionRequestBody>),
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
  // Legacy Pro (SEAT_29 / LARGE_FILES) and Business (SEAT_39) both migrate to
  // Business and share the same cancel / migration flow — see
  // FORCE_LEGACY_LARGE_PLAN_CODES.
  const isWorkspaceOnProOrBusinessPlan = isProOrBusinessPlanCode(plan);

  // Hooks must run unconditionally (before any early return): the migration
  // fetch is gated via `disabled`, not by skipping the hook.
  const { pendingMigrationDate, willBeRefundedOnEnd, mutateMigration } =
    useWorkspaceMigration({
      workspaceId: owner.sId,
      disabled: !isWorkspaceOnProOrBusinessPlan,
    });
  const { cancelMigration, isCancellingMigration } =
    useCancelWorkspaceMigration({ workspaceId: owner.sId });
  const { resumeMigration, isResumingMigration } = useResumeWorkspaceMigration({
    workspaceId: owner.sId,
  });

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

  // A migration is scheduled (pending Business contract staged): the workspace
  // can opt out (cancel) instead of being migrated.
  const scheduledMigrationLabel = pendingMigrationDate
    ? new Date(pendingMigrationDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  // A pending migration means the workspace is MIGRATING, not cancelled — this
  // is the authoritative, freshly-fetched signal. It takes precedence over a
  // lingering `subscription.endDate` (which can be stale right after a resume).
  const isMigrating = pendingMigrationDate !== null;
  // Cancelled (churning at the end date) only when not migrating.
  const isCancelledNotMigrating = !isMigrating && subscription.endDate !== null;

  // A Stripe-billed Pro or Business workspace (not trialing) can cancel — while
  // active or while migrating (opt out). Not when already cancelled (→ Resume).
  const canCancelSubscription =
    isWorkspaceOnProOrBusinessPlan &&
    !subscription.trialing &&
    subscription.stripeSubscriptionId !== null &&
    !isCancelledNotMigrating;
  // Cancelled (not migrating) but not yet ended — resume re-stages the migration.
  const canResumeMigration =
    isWorkspaceOnProOrBusinessPlan &&
    isCancelledNotMigrating &&
    subscription.endDate !== null &&
    new Date(subscription.endDate).getTime() > Date.now();

  const handleCancelMigration = async () => {
    const ok = await cancelMigration();
    if (ok) {
      setShowCancelMigrationDialog(false);
      await mutateMigration();
      router.reload();
    }
  };
  const handleResumeMigration = async () => {
    const ok = await resumeMigration();
    if (ok) {
      await mutateMigration();
      router.reload();
    }
  };

  const isProcessing =
    isSubscribingPlan || isGoingToStripePortal || isUpgradingToBusiness;

  const chipColor = !isUpgraded(plan) ? "success" : "highlight";

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

  const migrationDate = (() => {
    if (
      !isWorkspaceOnProOrBusinessPlan ||
      !isMetronomeCheckout ||
      !perSeatPricing
    ) {
      return null;
    }
    // Rollout window [Jul 23, Aug 23) 2026 (UTC), matching the migration script.
    const windowStartMs = Date.UTC(2026, 6, 23);
    const windowEndMs = Date.UTC(2026, 7, 23);

    let migrationMs: number;
    if (perSeatPricing.billingPeriod === "yearly") {
      if (perSeatPricing.currentPeriodEndMs === null) {
        return null;
      }
      // Fixed at the window start, at the subscription's billing-anchor hour
      // (== currentPeriodEnd's hour) — matches resolveMigrationDate.
      const anchorHour = new Date(
        perSeatPricing.currentPeriodEndMs
      ).getUTCHours();
      migrationMs = new Date(windowStartMs).setUTCHours(anchorHour, 0, 0, 0);
    } else {
      if (perSeatPricing.currentPeriodEndMs === null) {
        return null;
      }
      // Add `n` UTC months, clamping to the last day of the target month —
      // same as the script's `addMonthsUTC`.
      const addMonthsUTC = (ms: number, n: number): number => {
        const d = new Date(ms);
        const first = new Date(
          Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)
        );
        const ty = first.getUTCFullYear();
        const tm = first.getUTCMonth();
        const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
        return Date.UTC(
          ty,
          tm,
          Math.min(d.getUTCDate(), lastDay),
          d.getUTCHours(),
          d.getUTCMinutes(),
          d.getUTCSeconds()
        );
      };
      // Roll the monthly renewal boundary forward until it lands in the window
      // (do NOT unconditionally add a month) — same as `migrationDateInWindow`.
      let ms = perSeatPricing.currentPeriodEndMs;
      if (ms >= windowEndMs) {
        return null;
      }
      let guard = 0;
      while (ms < windowStartMs && guard < 24) {
        ms = addMonthsUTC(ms, 1);
        guard += 1;
      }
      if (ms < windowStartMs || ms >= windowEndMs) {
        return null;
      }
      migrationMs = ms;
    }
    return new Date(migrationMs).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  })();

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
        {(isCancellingMigration || isResumingMigration) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/60 dark:bg-black/60">
            <Spinner size="lg" />
          </div>
        )}
        {perSeatPricing && (
          <>
            <CancelFreeTrialDialog
              show={showCancelFreeTrialDialog}
              onClose={() => setShowCancelFreeTrialDialog(false)}
              onValidate={cancelFreeTrial}
              isSaving={cancelFreeTrialSubmitting}
            />

            <CancelMigrationDialog
              show={showCancelMigrationDialog}
              onClose={() => setShowCancelMigrationDialog(false)}
              onValidate={handleCancelMigration}
              isSaving={isCancellingMigration}
              billingPeriod={perSeatPricing.billingPeriod}
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
          <Page.Header title="Subscription" description="Manage your plan." />
          <Page.Vertical align="stretch" gap="md">
            <Page.H variant="h5">Your plan </Page.H>

            {isCancelledNotMigrating && endDate && (
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
                    {willBeRefundedOnEnd && (
                      <>
                        {" "}
                        You'll be refunded for the remaining days of your
                        current period.
                      </>
                    )}
                  </>
                )}
              </ContentMessage>
            )}
            {scheduledMigrationLabel ||
            (migrationDate && !isCancelledNotMigrating) ? (
              <ContentMessage
                title="Your plan is scheduled to migrate to the new credit-based pricing."
                variant="blue"
              >
                On{" "}
                <span className="font-semibold">
                  {scheduledMigrationLabel ?? migrationDate}
                </span>{" "}
                your plan will move to the new credit-based pricing.
                {perSeatPricing?.billingPeriod === "yearly" ? (
                  <>
                    {" "}
                    You'll be refunded for the remaining days of your current
                    annual period. To opt out, cancel your subscription below —
                    it will then end on that date without moving to the new
                    pricing.
                  </>
                ) : (
                  <>
                    {" "}
                    To opt out, cancel your subscription below — it will then
                    end at the end of your current billing period instead.
                  </>
                )}
              </ContentMessage>
            ) : null}
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
                          disabled={isCancellingMigration}
                          onClick={() => {
                            setShowCancelMigrationDialog(true);
                          }}
                        />
                      )}
                      {canResumeMigration && (
                        <Button
                          label="Resume subscription"
                          variant="primary"
                          disabled={isResumingMigration}
                          onClick={() => {
                            void handleResumeMigration();
                          }}
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
