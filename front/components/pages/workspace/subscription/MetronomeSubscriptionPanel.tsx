import { SubscriptionPlanCards } from "@app/components/plans/SubscriptionPlanCards";
import { useSendNotification } from "@app/hooks/useNotification";
import config from "@app/lib/api/config";
import { getPriceAsString } from "@app/lib/client/subscription";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { isEntreprisePlanPrefix, isUpgraded } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import {
  useMetronomeContract,
  useMetronomeInvoice,
  useWorkspaceSeatsCount,
} from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { PatchMetronomeContractRequestBody } from "@app/pages/api/w/[wId]/metronome/contract";
import type { BillingPeriod, SubscriptionType } from "@app/types/plan";
import { isSubscriptionMetronomeBilled } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Chip,
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
import type * as t from "io-ts";
import { useState } from "react";

const CONTACT_SALES_URL = `${config.getStaticWebsiteUrl()}/home/contact`;

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
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

function CancelMetronomeSubscriptionDialog({
  show,
  onClose,
  onValidate,
  isSaving,
  periodEndLabel,
}: CancelMetronomeSubscriptionDialogProps) {
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
            {periodEndLabel
              ? `Your subscription will end on ${periodEndLabel}. Until then you keep full access.`
              : "Your subscription will end at the end of the current billing period. Until then you keep full access."}
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
            label: "Keep subscription",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Cancel subscription",
            variant: "warning",
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
  const isEnterprise = isEntreprisePlanPrefix(subscription.plan.code);

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [showCancelDialog, setShowCancelDialog] = useState(false);

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

  const { submit: handleSubscribePlan, isSubmitting: isSubscribingPlan } =
    useSubmitFunction(async () => {
      const res = await clientFetch(`/api/w/${owner.sId}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingPeriod }),
      });

      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Subscription failed",
          description: "Failed to subscribe to a new plan.",
        });
        return;
      }

      const content = await res.json();
      if (content.checkoutUrl) {
        await router.push(content.checkoutUrl);
      } else if (content.success) {
        router.reload();
      }
    });

  const { submit: cancelSubscription, isSubmitting: isCancelling } =
    useSubmitFunction(async () => {
      try {
        const res = await clientFetch(
          `/api/w/${owner.sId}/metronome/contract`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "cancel",
            } satisfies t.TypeOf<typeof PatchMetronomeContractRequestBody>),
          }
        );
        if (!res.ok) {
          sendNotification({
            type: "error",
            title: "Cancellation failed",
            description: "Failed to cancel your subscription.",
          });
          return;
        }
        sendNotification({
          type: "success",
          title: "Subscription cancelled",
          description: "Your subscription will end at the end of the period.",
        });
        router.reload();
      } finally {
        setShowCancelDialog(false);
      }
    });

  const { submit: reactivateSubscription, isSubmitting: isReactivating } =
    useSubmitFunction(async () => {
      const res = await clientFetch(`/api/w/${owner.sId}/metronome/contract`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reactivate",
        } satisfies t.TypeOf<typeof PatchMetronomeContractRequestBody>),
      });
      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Reactivation failed",
          description: "Failed to reactivate your subscription.",
        });
        return;
      }
      sendNotification({
        type: "success",
        title: "Subscription reactivated",
        description: "Your subscription will continue normally.",
      });
      router.reload();
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

  const contractEndingLabel = contract?.contractEndingAt
    ? formatDate(contract.contractEndingAt)
    : null;
  const periodEndLabel = invoice ? formatDate(invoice.currentPeriodEnd) : null;
  const periodStartLabel = invoice
    ? formatDate(invoice.currentPeriodStart)
    : null;

  return (
    <>
      <CancelMetronomeSubscriptionDialog
        show={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onValidate={cancelSubscription}
        isSaving={isCancelling}
        periodEndLabel={periodEndLabel}
      />

      <Page.Vertical align="stretch" gap="md">
        <div>
          <Page.Horizontal gap="sm">
            <Chip size="sm" color={chipColor} label={plan.name} />
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
          <div className="my-5 flex flex-row gap-2">
            {!isEnterprise &&
              (isCancellationScheduled ? (
                <Button
                  label="Resume subscription"
                  variant="highlight"
                  disabled={isReactivating}
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
                  label="Cancel subscription"
                  variant="warning"
                  disabled={isCancelling}
                  onClick={withTracking(
                    TRACKING_AREAS.AUTH,
                    "subscription_cancel",
                    () => {
                      setShowCancelDialog(true);
                    }
                  )}
                />
              ))}
          </div>
        </Page.Vertical>

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
