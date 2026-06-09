import { SubscriptionPlanCards } from "@app/components/plans/SubscriptionPlanCards";
import {
  useCancelMetronomeContract,
  useReactivateMetronomeContract,
} from "@app/hooks/useMetronomeContractLifecycleAction";
import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import type { PatchSubscriptionRequestBody } from "@app/lib/api/subscription";
import { getPriceAsString } from "@app/lib/client/subscription";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import {
  isEnterprisePlanPrefix,
  isProPlan,
  isUpgraded,
  isWhitelistedBusinessPlan,
} from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import {
  useMetronomeContract,
  useMetronomeInvoice,
  useWorkspaceSeatsCount,
} from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { BillingPeriod, SubscriptionType } from "@app/types/plan";
import { isSubscriptionMetronomeBilled } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
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
import { useState } from "react";
import type { z } from "zod";

const CONTACT_SALES_URL = `${config.getStaticWebsiteUrl()}/home/contact`;

function formatDate(msEpoch: number): string {
  return new Date(msEpoch).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

interface CancelMetronomeSubscriptionDialogProps {
  show: boolean;
  onClose: () => void;
  onValidate: () => Promise<void>;
  isSaving: boolean;
  periodEndLabel: string | null;
}

export function CancelMetronomeSubscriptionDialog({
  show,
  onClose,
  onValidate,
  isSaving,
  periodEndLabel,
}: CancelMetronomeSubscriptionDialogProps) {
  // "July 12, 2026" → "July 12"
  const shortDate = periodEndLabel ? periodEndLabel.split(",")[0] : null;

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
          <DialogTitle>Cancel your subscription</DialogTitle>
          <DialogDescription>
            {periodEndLabel ? (
              <>
                Your plan will remain active until{" "}
                <span className="font-bold">{periodEndLabel}</span>.
              </>
            ) : (
              "Your plan will remain active until the end of the current billing period."
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          {isSaving ? (
            <div className="flex justify-center py-8">
              <Spinner variant="dark" size="md" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {periodEndLabel && (
                <ContentMessage size="sm" variant="highlight">
                  You can resume your subscription any time before{" "}
                  {periodEndLabel} with no interruption to your plan.
                </ContentMessage>
              )}
              <div className="flex flex-col gap-3">
                <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                  What happens next
                </div>
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                      {shortDate
                        ? `Until ${shortDate}`
                        : "Until your plan ends"}
                    </div>
                    <div className="text-sm text-muted-foreground ark:text-muted-foreground-night">
                      Everything works exactly as it does today. You keep full
                      access to your workspace.
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                      {shortDate
                        ? `After ${shortDate}`
                        : "After your plan ends"}
                    </div>
                    <div className="text-sm text-muted-foreground ark:text-muted-foreground-night">
                      Your workspace becomes read-only. Members keep their
                      accounts and can still sign in to view content.
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                      Your data
                    </div>
                    <div className="text-sm text-muted-foreground ark:text-muted-foreground-night">
                      Agents, conversations, and connected data sources are
                      preserved for 30 days. Reactivate any time during that
                      window.
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                      Invoices
                    </div>
                    <div className="text-sm text-muted-foreground ark:text-muted-foreground-night">
                      Past invoices remain available indefinitely from this
                      page.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Keep my subscription",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Cancel Subscription",
            variant: "warning",
            onClick: onValidate,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface UpgradeToBusinessDialogProps {
  show: boolean;
  onClose: () => void;
  onValidate: () => Promise<void>;
  isSaving: boolean;
}

function UpgradeToBusinessDialog({
  show,
  onClose,
  onValidate,
  isSaving,
}: UpgradeToBusinessDialogProps) {
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
          <DialogTitle>Upgrade to Enterprise seat-based plan</DialogTitle>
          <DialogDescription>
            Your current contract will end now and a new contract on the
            Enterprise seat-based plan will start immediately. Future invoices
            will reflect the new pricing.
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
            label: "Upgrade",
            variant: "primary",
            onClick: onValidate,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface MetronomeSubscriptionPanelProps {
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
}

export function MetronomeSubscriptionPanel({
  owner,
  subscription,
}: MetronomeSubscriptionPanelProps) {
  const router = useAppRouter();
  const sendNotification = useSendNotification();

  const isMetronomeBilled = isSubscriptionMetronomeBilled(subscription);
  const isEnterprise = isEnterprisePlanPrefix(subscription.plan.code);

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  const { seatsCount, isSeatsCountLoading } = useWorkspaceSeatsCount({
    workspaceId: owner.sId,
    disabled: !isMetronomeBilled,
  });
  const { contract, isMetronomeContractLoading } = useMetronomeContract({
    workspaceId: owner.sId,
    disabled: !isMetronomeBilled,
  });
  const { invoice, isMetronomeInvoiceLoading } = useMetronomeInvoice({
    workspaceId: owner.sId,
    disabled: !isMetronomeBilled,
  });
  const { cancelMetronomeContract, isCancellingMetronomeContract } =
    useCancelMetronomeContract({
      workspaceId: owner.sId,
    });
  const { reactivateMetronomeContract, isReactivatingMetronomeContract } =
    useReactivateMetronomeContract({
      workspaceId: owner.sId,
    });

  const { submit: handleSubscribePlan, isSubmitting: isSubscribingPlan } =
    useSubmitFunction(async () => {
      await router.push(
        `/w/${owner.sId}/subscription/checkout?billingPeriod=${billingPeriod}`
      );
    });

  const { submit: cancelSubscription, isSubmitting: isCancelling } =
    useSubmitFunction(async () => {
      try {
        const success = await cancelMetronomeContract();
        if (success) {
          router.reload();
        }
      } finally {
        setShowCancelDialog(false);
      }
    });

  const { submit: reactivateSubscription, isSubmitting: isReactivating } =
    useSubmitFunction(async () => {
      const success = await reactivateMetronomeContract();
      if (success) {
        router.reload();
      }
    });

  const isCancellingSubscription =
    isCancelling || isCancellingMetronomeContract;
  const isReactivatingSubscription =
    isReactivating || isReactivatingMetronomeContract;

  const {
    submit: handleUpgradeToBusiness,
    isSubmitting: isUpgradingToBusiness,
  } = useSubmitFunction(async () => {
    try {
      const res = await clientFetch(`/api/w/${owner.sId}/subscriptions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upgrade_to_business",
        } satisfies z.infer<typeof PatchSubscriptionRequestBody>),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        sendNotification({
          type: "error",
          title: "Upgrade failed",
          description:
            body?.error?.message ??
            "Failed to upgrade to Enterprise seat-based plan.",
        });
        return;
      }
      sendNotification({
        type: "success",
        title: "Upgrade successful",
        description:
          "Your workspace has been upgraded to Enterprise seat-based plan.",
      });
      router.reload();
    } finally {
      setShowUpgradeDialog(false);
    }
  });

  if (!isMetronomeBilled) {
    return (
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
            isProcessing={isSubscribingPlan}
            owner={owner}
          />
        </div>
      </div>
    );
  }

  const plan = subscription.plan;
  const chipColor = !isUpgraded(plan) ? "green" : "blue";
  const isCancellationScheduled =
    subscription.endDate !== null || subscription.requestCancelAt !== null;
  const canUpsellToBusinessPlan =
    isProPlan(plan) && isWhitelistedBusinessPlan(owner);

  const contractEndingLabel = contract?.contractEndingAtMs
    ? formatDate(contract.contractEndingAtMs)
    : null;
  const periodEndLabel = invoice
    ? formatDate(invoice.currentPeriodEndMs)
    : null;
  const periodStartLabel = invoice
    ? formatDate(invoice.currentPeriodStartMs)
    : null;

  return (
    <>
      <CancelMetronomeSubscriptionDialog
        show={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onValidate={cancelSubscription}
        isSaving={isCancellingSubscription}
        periodEndLabel={periodEndLabel}
      />
      <UpgradeToBusinessDialog
        show={showUpgradeDialog}
        onClose={() => setShowUpgradeDialog(false)}
        onValidate={handleUpgradeToBusiness}
        isSaving={isUpgradingToBusiness}
      />

      <Page.Vertical align="stretch" gap="md">
        <div>
          <Page.Horizontal gap="sm">
            <Chip size="sm" color={chipColor} label={plan.name} />
            {!isEnterprise &&
              (isCancellationScheduled ? (
                <Button
                  size="sm"
                  label="Resume subscription"
                  variant="highlight"
                  disabled={isReactivatingSubscription}
                  onClick={withTracking(
                    TRACKING_AREAS.AUTH,
                    "subscription_reactivate",
                    () => {
                      void reactivateSubscription();
                    }
                  )}
                />
              ) : (
                <Button
                  size="sm"
                  label="Cancel subscription"
                  variant="warning"
                  disabled={isCancellingSubscription}
                  onClick={withTracking(
                    TRACKING_AREAS.AUTH,
                    "subscription_cancel",
                    () => {
                      setShowCancelDialog(true);
                    }
                  )}
                />
              ))}
          </Page.Horizontal>
        </div>

        <Page.Vertical gap="sm">
          <Page.H variant="h5">Contract</Page.H>
          {isMetronomeContractLoading || isSeatsCountLoading ? (
            <Spinner size="sm" />
          ) : contract && invoice ? (
            <ContractSection
              contract={contract}
              invoice={invoice}
              seatsCount={seatsCount}
            />
          ) : (
            <Page.P>No contract information available.</Page.P>
          )}
          {contractEndingLabel && (
            <Page.P>Contract ends on {contractEndingLabel}.</Page.P>
          )}
        </Page.Vertical>

        <Page.Vertical gap="sm">
          <Page.H variant="h5">Current billing period</Page.H>
          {isMetronomeInvoiceLoading ? (
            <Spinner size="sm" />
          ) : invoice && periodStartLabel && periodEndLabel ? (
            <>
              <Page.P>
                {periodStartLabel} — {periodEndLabel}.
              </Page.P>
              <Page.P>
                Estimated {invoice.billingPeriod} billing:{" "}
                <span className="font-bold">
                  {getPriceAsString({
                    currency: invoice.currency,
                    priceInCents: invoice.estimatedAmountCents,
                  })}
                </span>{" "}
                (excluding taxes).
              </Page.P>
            </>
          ) : (
            <Page.P>
              No billing information available for this period yet.
            </Page.P>
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
                  window.open(`/w/${owner.sId}/subscription/manage`, "_blank");
                }
              )}
            />
          </div>
        </Page.Vertical>

        {canUpsellToBusinessPlan && (
          <Page.Vertical gap="sm">
            <Page.H variant="h5">Upgrade your plan</Page.H>
            <Page.P>
              You are eligible to upgrade to the Enterprise seat-based plan with
              additional features.
            </Page.P>
            <div>
              <Button
                label="Upgrade to Enterprise seat-based plan"
                variant="primary"
                disabled={isUpgradingToBusiness}
                onClick={withTracking(
                  TRACKING_AREAS.AUTH,
                  "subscription_upgrade_to_business",
                  () => {
                    setShowUpgradeDialog(true);
                  }
                )}
              />
            </div>
          </Page.Vertical>
        )}

        {isEnterprise && (
          <Page.Vertical gap="sm">
            <Page.H variant="h5">Need changes?</Page.H>
            <Page.P>
              Reach out to sales to adjust your enterprise contract.
            </Page.P>
            <div>
              <Button
                label="Contact sales"
                variant="outline"
                href={CONTACT_SALES_URL}
                target="_blank"
              />
            </div>
          </Page.Vertical>
        )}
      </Page.Vertical>
    </>
  );
}

interface ContractSectionProps {
  contract: NonNullable<ReturnType<typeof useMetronomeContract>["contract"]>;
  invoice: NonNullable<ReturnType<typeof useMetronomeInvoice>["invoice"]>;
  seatsCount: number;
}

function ContractSection({
  contract,
  invoice,
  seatsCount,
}: ContractSectionProps) {
  const { currency } = invoice;

  if (contract.planFamily === "pro") {
    const seatPrice = invoice.seatUnitPriceCents;
    return (
      <>
        <Page.P>
          {seatsCount === 1 ? `${seatsCount} member` : `${seatsCount} members`}
          {seatPrice !== null
            ? ` — ${getPriceAsString({ currency, priceInCents: seatPrice })} per member.`
            : "."}
        </Page.P>
      </>
    );
  }

  // Enterprise
  if (contract.mauTiers && invoice.mauTierUnitPricesCents) {
    return (
      <>
        <Page.P>
          {invoice.mau !== null
            ? `${invoice.mau} active ${invoice.mau === 1 ? "user" : "users"} this period`
            : "MAU billing"}
          {" (tiered):"}
        </Page.P>
        <div className="pl-4">
          {contract.mauTiers.map((tier, idx) => {
            const price = invoice.mauTierUnitPricesCents?.[idx] ?? null;
            const label =
              tier.end !== null
                ? `${tier.start}–${tier.end - 1} users`
                : `${tier.start}+ users`;
            const priceLabel =
              price !== null
                ? getPriceAsString({ currency, priceInCents: price })
                : "—";
            return (
              <Page.P key={`${tier.start}-${tier.end ?? "inf"}`}>
                {label}: {priceLabel} per user.
              </Page.P>
            );
          })}
        </div>
      </>
    );
  }

  // Simple MAU
  const mauPrice = invoice.mauUnitPriceCents;
  return (
    <Page.P>
      {invoice.mau !== null
        ? `${invoice.mau} active ${invoice.mau === 1 ? "user" : "users"} this period`
        : "MAU billing"}
      {mauPrice !== null
        ? ` — ${getPriceAsString({ currency, priceInCents: mauPrice })} per active user.`
        : "."}
    </Page.P>
  );
}
