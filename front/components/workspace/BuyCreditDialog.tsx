import {
  Button,
  Checkbox,
  CheckCircleIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ExternalLinkIcon,
  Hoverable,
  Icon,
  Input,
  Spinner,
  XCircleIcon,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { usePurchaseCredits } from "@app/lib/swr/credits";
import type { StripePricingData } from "@app/lib/types/stripe/pricing";
import { CURRENCY_SYMBOLS, isSupportedCurrency } from "@app/types/currency";

type PurchaseState = "idle" | "processing" | "success" | "redirect" | "error";

interface BuyCreditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  isEnterprise: boolean;
  currency: string;
  discountPercent: number;
  creditPricing: StripePricingData | null;
}

export function BuyCreditDialog({
  isOpen,
  onClose,
  workspaceId,
  isEnterprise,
  currency,
  discountPercent,
  creditPricing,
}: BuyCreditDialogProps) {
  const [amountDollars, setAmountDollars] = useState<string>("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedNonRefundable, setAcceptedNonRefundable] = useState(false);
  const [purchaseState, setPurchaseState] = useState<PurchaseState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const { purchaseCredits } = usePurchaseCredits({ workspaceId });

  useEffect(() => {
    if (isOpen) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setAmountDollars("");
      setAcceptedTerms(false);
      setAcceptedNonRefundable(false);
      setPurchaseState("idle");
      setErrorMessage("");
      setPaymentUrl(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [isOpen]);

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
    }
  };

  const parsedAmount = parseFloat(amountDollars) || 0;
  const isValidAmount = parsedAmount > 0;

  const effectiveDiscount = discountPercent || 0;
  const displayCurrency = isSupportedCurrency(currency) ? currency : "usd";
  const currencySymbol = CURRENCY_SYMBOLS[displayCurrency];
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

  const canPurchase = isValidAmount && acceptedTerms && acceptedNonRefundable;

  const renderContent = () => {
    switch (purchaseState) {
      case "processing":
        return (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Spinner size="lg" />
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Processing purchase...
            </p>
          </div>
        );

      case "success":
        return (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Icon
              visual={CheckCircleIcon}
              size="lg"
              className="text-success-500"
            />
            <div className="text-center">
              <p className="text-lg font-medium text-foreground dark:text-foreground-night">
                Credits purchased successfully!
              </p>
              <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
                Your credits are now available.
              </p>
              <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
                <span className="font-semibold">
                  Invoice has been sent by email.
                </span>
              </p>
            </div>
          </div>
        );

      case "redirect":
        return (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Icon
              visual={ExternalLinkIcon}
              size="lg"
              className="text-primary dark:text-primary-night"
            />
            <div className="text-center">
              <p className="text-lg font-medium text-foreground dark:text-foreground-night">
                Payment confirmation required
              </p>
              <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
                Please complete the payment to finalize your credit purchase.
              </p>
            </div>
          </div>
        );

      case "error":
        return (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Icon visual={XCircleIcon} size="lg" className="text-warning-500" />
            <div className="text-center">
              <p className="text-lg font-medium text-foreground dark:text-foreground-night">
                Something went wrong
              </p>
              <p className="mt-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
                {errorMessage}
              </p>
              <p className="mt-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
                Please contact support if the issue persists.
              </p>
            </div>
          </div>
        );

      default:
        return (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="amount"
                className="text-sm font-medium text-foreground dark:text-foreground-night"
              >
                Credits amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground-night">
                  $
                </span>
                <Input
                  id="amount"
                  type="number"
                  placeholder="10"
                  value={amountDollars}
                  onChange={(e) => setAmountDollars(e.target.value)}
                  min="0"
                  step="1"
                  className="pl-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </div>
            </div>

            {isValidAmount && (
              <div className="flex flex-col gap-1 rounded-md border border-border bg-muted-background p-3 text-sm dark:border-border-night dark:bg-muted-background-night">
                <div className="flex justify-between">
                  <span className="text-muted-foreground dark:text-muted-foreground-night">
                    Credits
                  </span>
                  <span className="font-medium text-foreground dark:text-foreground-night">
                    ${parsedAmount.toFixed(2)}
                  </span>
                </div>
                {needsConversion && (
                  <div className="flex justify-between">
                    <span></span>
                    <span className="text-muted-foreground dark:text-muted-foreground-night">
                      {currencySymbol}
                      {creditsInCurrency.toFixed(2)}
                    </span>
                  </div>
                )}
                {effectiveDiscount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground dark:text-muted-foreground-night">
                      Discount ({effectiveDiscount}%)
                    </span>
                    <span className="font-medium text-success-500">
                      -{currencySymbol}
                      {discountInCurrency.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground dark:text-muted-foreground-night">
                    Tax
                  </span>
                  <span className="text-muted-foreground dark:text-muted-foreground-night">
                    Calculated on invoice
                  </span>
                </div>
                <div className="mt-1 flex justify-between border-t border-border pt-2 dark:border-border-night">
                  <span className="font-medium text-foreground dark:text-foreground-night">
                    Total
                  </span>
                  <span className="font-medium text-foreground dark:text-foreground-night">
                    {currencySymbol}
                    {totalInCurrency.toFixed(2)}
                    <span className="ml-1 text-xs text-muted-foreground dark:text-muted-foreground-night">
                      (excl. tax)
                    </span>
                  </span>
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              {isEnterprise ? (
                <p>
                  Credits will be added immediately, will be invoiced at the end
                  of your billing cycle, and expire one year after purchase.
                </p>
              ) : (
                <p>
                  Credits will be charged immediately, and expire one year after
                  purchase.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4 dark:border-border-night">
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={acceptedTerms}
                  onCheckedChange={() => setAcceptedTerms(!acceptedTerms)}
                />
                <span className="text-sm text-foreground dark:text-foreground-night">
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
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={acceptedNonRefundable}
                  onCheckedChange={() =>
                    setAcceptedNonRefundable(!acceptedNonRefundable)
                  }
                />
                <span className="text-sm text-foreground dark:text-foreground-night">
                  I understand credits are non-refundable after purchase
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
              label: "Cancel",
              variant: "outline",
              disabled: true,
            }}
            rightButtonProps={{
              label: "Processing...",
              variant: "primary",
              disabled: true,
            }}
          />
        );
      case "success":
        return (
          <DialogFooter
            rightButtonProps={{
              label: "Close",
              variant: "primary",
              onClick: onClose,
            }}
          />
        );
      case "redirect":
        return (
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: onClose,
            }}
            rightButtonProps={{
              label: "Go to Payment",
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
            rightButtonProps={{
              label: "Close",
              variant: "outline",
              onClick: onClose,
            }}
          />
        );
      default:
        return (
          <DialogFooter>
            <Button label="Cancel" variant="outline" onClick={onClose} />
            <Button
              label="Purchase Credits"
              variant="primary"
              onClick={handlePurchase}
              disabled={!canPurchase}
            />
          </DialogFooter>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Purchase Programmatic Credits</DialogTitle>
          <DialogDescription>
            Purchase credits for programmatic API usage.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>{renderContent()}</DialogContainer>
        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
}
