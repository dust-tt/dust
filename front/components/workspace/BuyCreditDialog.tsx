import { getPriceAsString } from "@app/lib/client/subscription";
import type { CreditPurchaseLimits } from "@app/lib/credits/limits";
import { formatCurrency } from "@app/lib/i18n/format";
import { usePurchaseCredits } from "@app/lib/swr/credits";
import { isSupportedCurrency } from "@app/types/currency";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { StripePricingData } from "@app/types/stripe/pricing";
import {
  Button,
  Checkbox,
  CheckCircle,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Hoverable,
  Icon,
  InfoCircle,
  Input,
  LinkExternal01,
  Spinner,
  XCircle,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useState } from "react";

type PurchaseState = "idle" | "processing" | "success" | "redirect" | "error";

const SUPPORT_EMAIL = "support@dust.tt";

// Minimum purchase amount in microUsd ($1).
const LIMIT_EXHAUSTED_THRESHOLD_MICRO_USD = 1_000_000;

interface PaygUsage {
  consumed: number;
  total: number;
}

interface BuyCreditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  isEnterprise: boolean;
  currency: string;
  discountPercent: number;
  creditPricing: StripePricingData | null;
  creditPurchaseLimits: CreditPurchaseLimits | null;
  paygUsage: PaygUsage | null;
}

// Threshold percentage for pay-as-you-go cap usage below which we show a warning.
const PAYG_CAP_WARNING_THRESHOLD_PERCENT = 70;

export function BuyCreditDialog({
  isOpen,
  onClose,
  workspaceId,
  isEnterprise,
  currency,
  discountPercent,
  creditPricing,
  creditPurchaseLimits,
  paygUsage,
}: BuyCreditDialogProps) {
  const { t } = useLingui();
  const [amountDollars, setAmountDollars] = useState<string>("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedNonRefundable, setAcceptedNonRefundable] = useState(false);
  const [purchaseState, setPurchaseState] = useState<PurchaseState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const { purchaseCredits } = usePurchaseCredits({ workspaceId });

  const resetModalStateAndClose = useCallback(() => {
    setAmountDollars("");
    setAcceptedTerms(false);
    setAcceptedNonRefundable(false);
    setPurchaseState("idle");
    setErrorMessage("");
    setPaymentUrl(null);
    onClose();
  }, [onClose]);

  const maxAmountDollars = useMemo(() => {
    if (!creditPurchaseLimits || !creditPurchaseLimits.canPurchase) {
      return null;
    }
    return Math.floor(creditPurchaseLimits.maxAmountMicroUsd / 1_000_000);
  }, [creditPurchaseLimits]);

  const maxAmountFormatted = useMemo(() => {
    if (!creditPurchaseLimits || !creditPurchaseLimits.canPurchase) {
      return null;
    }
    return getPriceAsString({
      currency: "usd",
      priceInMicroUsd: creditPurchaseLimits.maxAmountMicroUsd,
    });
  }, [creditPurchaseLimits]);

  const amountExceedsMax = useMemo(() => {
    if (!maxAmountDollars) {
      return false;
    }
    const amount = parseFloat(amountDollars);
    return !isNaN(amount) && amount > maxAmountDollars;
  }, [amountDollars, maxAmountDollars]);

  // Show warning for enterprise users when pay-as-you-go usage is under the threshold.
  const showPaygCapWarning = useMemo(() => {
    if (!isEnterprise || !paygUsage || paygUsage.total === 0) {
      return false;
    }
    const percentUsed = (paygUsage.consumed / paygUsage.total) * 100;
    return percentUsed < PAYG_CAP_WARNING_THRESHOLD_PERCENT;
  }, [isEnterprise, paygUsage]);

  const handlePurchase = async () => {
    setPurchaseState("processing");
    const result = await purchaseCredits(parseFloat(amountDollars));

    switch (result.status) {
      case "success":
        setPurchaseState("success");
        break;
      case "redirect":
        setPaymentUrl(result.paymentUrl);
        setPurchaseState("redirect");
        break;
      case "error":
        setErrorMessage(result.message);
        setPurchaseState("error");
        break;
      default:
        assertNever(result);
    }
  };

  const parsedAmount = parseFloat(amountDollars) || 0;
  const isValidAmount = parsedAmount > 0;

  const effectiveDiscount = discountPercent || 0;
  const displayCurrency = isSupportedCurrency(currency) ? currency : "usd";
  const needsConversion = displayCurrency !== "usd";

  // Calculate conversion using Stripe pricing data
  let creditsInCurrency = parsedAmount;
  if (needsConversion && creditPricing) {
    const usdUnitAmount = creditPricing.currencyOptions.usd.unitAmount;
    const displayUnitAmount =
      creditPricing.currencyOptions[displayCurrency].unitAmount;
    if (usdUnitAmount > 0 && displayUnitAmount > 0) {
      const exchangeRate = displayUnitAmount / usdUnitAmount;
      creditsInCurrency = parsedAmount * exchangeRate;
    }
  }

  const discountInCurrency = creditsInCurrency * (effectiveDiscount / 100);
  const totalInCurrency = creditsInCurrency - discountInCurrency;

  const canPurchase =
    isValidAmount &&
    acceptedTerms &&
    acceptedNonRefundable &&
    !amountExceedsMax;

  const renderContent = () => {
    switch (purchaseState) {
      case "processing":
        return (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Spinner size="lg" />
            <p className="text-sm text-muted-foreground">
              <Trans>Processing purchase...</Trans>
            </p>
          </div>
        );

      case "success":
        return (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Icon visual={CheckCircle} size="lg" className="text-success-500" />
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">
                <Trans>Credits purchased successfully!</Trans>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                <Trans>Your credits are now available.</Trans>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-semibold">
                  <Trans>Invoice has been sent by email.</Trans>
                </span>
              </p>
            </div>
          </div>
        );

      case "redirect":
        return (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Icon visual={LinkExternal01} size="lg" className="text-primary" />
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">
                <Trans>Payment confirmation required</Trans>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                <Trans>
                  Please complete the payment to finalize your credit purchase
                  or contact support to cancel pending invoices.
                </Trans>
              </p>
            </div>
          </div>
        );

      case "error":
        return (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Icon visual={XCircle} size="lg" className="text-warning-500" />
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">
                <Trans>Something went wrong</Trans>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {errorMessage}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                <Trans>Please contact support if the issue persists.</Trans>
              </p>
            </div>
          </div>
        );

      default:
        return (
          <div className="flex flex-col gap-4">
            {showPaygCapWarning && (
              <ContentMessage
                variant="info"
                icon={InfoCircle}
                title={t`You still have pay-as-you-go capacity`}
              >
                <Trans>
                  You're still under {PAYG_CAP_WARNING_THRESHOLD_PERCENT}% of
                  your pay-as-you-go cap.
                </Trans>
              </ContentMessage>
            )}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="amount"
                className="text-sm font-medium text-foreground"
              >
                <Trans>Credits amount</Trans>
              </label>
              <div className="flex flex-col gap-1">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="10"
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                    min="0"
                    max={maxAmountDollars ?? undefined}
                    step="1"
                    className="pl-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    isError={amountExceedsMax}
                  />
                </div>
                {amountExceedsMax && (
                  <span className="text-xs text-foreground-warning">
                    <Trans>
                      Maximum purchase amount is {maxAmountFormatted}
                    </Trans>
                  </span>
                )}
              </div>
            </div>

            {isValidAmount && !amountExceedsMax && (
              <div className="flex flex-col gap-1 rounded-md border border-border bg-muted-background p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    <Trans>Credits</Trans>
                  </span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(parsedAmount, "usd")}
                  </span>
                </div>
                {needsConversion && (
                  <div className="flex justify-between">
                    <span></span>
                    <span className="text-muted-foreground">
                      {formatCurrency(creditsInCurrency, displayCurrency)}
                    </span>
                  </div>
                )}
                {effectiveDiscount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      <Trans>Discount ({effectiveDiscount}%)</Trans>
                    </span>
                    <span className="font-medium text-success-500">
                      -{formatCurrency(discountInCurrency, displayCurrency)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    <Trans>Tax</Trans>
                  </span>
                  <span className="text-muted-foreground">
                    <Trans>Calculated on invoice</Trans>
                  </span>
                </div>
                <div className="mt-1 flex justify-between border-t border-border pt-2">
                  <span className="font-medium text-foreground">
                    <Trans>Total</Trans>
                  </span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(totalInCurrency, displayCurrency)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      <Trans>(excl. tax)</Trans>
                    </span>
                  </span>
                </div>
              </div>
            )}

            {maxAmountFormatted && (
              <p className="text-xs text-muted-foreground">
                <Trans>
                  Purchase up to {maxAmountFormatted} worth of credits.{" "}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}?subject=Higher%20credit%20limit%20request`}
                    className="text-action-500 hover:underline"
                  >
                    Contact support
                  </a>{" "}
                  if you need more.
                </Trans>
              </p>
            )}

            <div className="text-xs text-muted-foreground">
              {isEnterprise ? (
                <p>
                  <Trans>
                    Credits will be added immediately, will be invoiced at the
                    end of your billing cycle, and expire one year after
                    purchase.
                  </Trans>
                </p>
              ) : (
                <p>
                  <Trans>
                    Credits will be charged immediately, and expire one year
                    after purchase.
                  </Trans>
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={acceptedTerms}
                  onCheckedChange={() => setAcceptedTerms(!acceptedTerms)}
                />
                <span className="text-sm text-foreground">
                  <Trans>
                    I agree to the{" "}
                    <Hoverable
                      href="https://dust.tt/terms"
                      variant="highlight"
                      target="_blank"
                    >
                      Terms & Conditions
                    </Hoverable>{" "}
                    and{" "}
                    <Hoverable
                      href="https://dust.tt/privacy"
                      variant="highlight"
                      target="_blank"
                    >
                      Privacy Policy
                    </Hoverable>
                  </Trans>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={acceptedNonRefundable}
                  onCheckedChange={() =>
                    setAcceptedNonRefundable(!acceptedNonRefundable)
                  }
                />
                <span className="text-sm text-foreground">
                  <Trans>
                    I understand credits are non-refundable after purchase
                  </Trans>
                </span>
              </label>
            </div>
          </div>
        );
    }
  };

  const renderFooter = () => {
    switch (purchaseState) {
      case "processing":
        return (
          <DialogFooter
            leftButtonProps={{
              label: t`Cancel`,
              variant: "outline",
              disabled: true,
            }}
            rightButtonProps={{
              label: t`Processing...`,
              variant: "primary",
              disabled: true,
            }}
          />
        );
      case "success":
        return (
          <DialogFooter
            rightButtonProps={{
              label: t`Close`,
              variant: "primary",
              onClick: resetModalStateAndClose,
            }}
          />
        );
      case "redirect":
        return (
          <DialogFooter
            leftButtonProps={{
              label: t`Cancel`,
              variant: "outline",
              onClick: resetModalStateAndClose,
            }}
            rightButtonProps={{
              label: t`Go to payment`,
              variant: "primary",
              onClick: () => {
                if (paymentUrl) {
                  window.open(paymentUrl, "_blank")?.focus();
                }
              },
            }}
          />
        );
      case "error":
        return (
          <DialogFooter
            leftButtonProps={{
              label: t`Close`,
              variant: "outline",
              onClick: resetModalStateAndClose,
            }}
            rightButtonProps={{
              label: t`Manage invoices`,
              variant: "primary",
              onClick: () => {
                window.open(`/w/${workspaceId}/subscription/manage`, "_blank");
              },
            }}
          />
        );
      default:
        return (
          <DialogFooter>
            <Button
              label={t`Cancel`}
              variant="outline"
              onClick={resetModalStateAndClose}
            />
            <Button
              label={t`Purchase credits`}
              variant="primary"
              onClick={handlePurchase}
              disabled={!canPurchase}
            />
          </DialogFooter>
        );
    }
  };

  // Cannot purchase: trialing.
  if (
    creditPurchaseLimits &&
    !creditPurchaseLimits.canPurchase &&
    creditPurchaseLimits.reason === "trialing"
  ) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              <Trans>Purchase programmatic credits</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                Credit purchases are not available during your trial period.
              </Trans>
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                <Trans>
                  Credit purchases become available once you upgrade to a paid
                  plan. If you need credits during your trial, please contact
                  our support team.
                </Trans>
              </p>
              <Button
                label={t`Contact ${SUPPORT_EMAIL}`}
                variant="outline"
                onClick={() =>
                  window.open(
                    `mailto:${SUPPORT_EMAIL}?subject=Credit%20purchase%20during%20trial`,
                    "_blank"
                  )
                }
              />
            </div>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: t`Close`,
              variant: "outline",
              onClick: onClose,
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Cannot purchase: payment issue.
  if (
    creditPurchaseLimits &&
    !creditPurchaseLimits.canPurchase &&
    creditPurchaseLimits.reason === "payment_issue"
  ) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              <Trans>Purchase programmatic credits</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>Credit purchases require an active subscription.</Trans>
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                <Trans>
                  Please ensure your subscription is active and your payment
                  method is up to date. If you need assistance, please contact
                  our support team.
                </Trans>
              </p>
              <Button
                label={t`Contact ${SUPPORT_EMAIL}`}
                variant="outline"
                onClick={() =>
                  window.open(
                    `mailto:${SUPPORT_EMAIL}?subject=Credit%20purchase%20-%20payment%20issue`,
                    "_blank"
                  )
                }
              />
            </div>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: t`Close`,
              variant: "outline",
              onClick: onClose,
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Cannot purchase: pending payment.
  if (
    creditPurchaseLimits &&
    !creditPurchaseLimits.canPurchase &&
    creditPurchaseLimits.reason === "pending_payment"
  ) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              <Trans>Purchase programmatic credits</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>You have pending credit purchases awaiting payment.</Trans>
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                <Trans>
                  Please complete your pending payment before making a new
                  purchase or contact support to cancel your pending payments.
                </Trans>{" "}
                <a
                  href="https://dust-tt.notion.site/Programmatic-usage-at-Dust-2b728599d94181ceb124d8585f794e2e#2ce28599d94180f69e02e90280c309b4"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-action-500 hover:underline"
                >
                  <Trans>Learn more</Trans>
                </a>
              </p>
            </div>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: t`Close`,
              variant: "outline",
              onClick: onClose,
            }}
            rightButtonProps={{
              label: t`Manage invoices`,
              variant: "primary",
              onClick: () => {
                window.open(`/w/${workspaceId}/subscription/manage`, "_blank");
              },
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Limit exhausted for this billing cycle.
  if (
    creditPurchaseLimits &&
    creditPurchaseLimits.canPurchase &&
    creditPurchaseLimits.maxAmountMicroUsd < LIMIT_EXHAUSTED_THRESHOLD_MICRO_USD
  ) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              <Trans>Purchase programmatic credits</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                You've reached your credit limit for this billing cycle.
              </Trans>
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                <Trans>
                  Your credit purchase limit resets at the start of your next
                  billing cycle. If you need additional credits before then,
                  please contact our support team.
                </Trans>
              </p>
              <Button
                label={t`Contact ${SUPPORT_EMAIL}`}
                variant="outline"
                onClick={() =>
                  window.open(
                    `mailto:${SUPPORT_EMAIL}?subject=Credit%20purchase%20limit%20reached`,
                    "_blank"
                  )
                }
              />
            </div>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: t`Close`,
              variant: "outline",
              onClick: onClose,
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Can purchase.
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && resetModalStateAndClose()}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            <Trans>Purchase programmatic credits</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Purchase credits for programmatic API usage.</Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>{renderContent()}</DialogContainer>
        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
}
