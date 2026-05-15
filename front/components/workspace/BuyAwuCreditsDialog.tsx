import config from "@app/lib/api/config";
import type { CreditPurchaseLimits } from "@app/lib/credits/limits";
import {
  AWU_CREDITS_PER_DOLLAR,
  MAX_CREDIT_PURCHASE_AMOUNT_MICRO_USD,
  MICRO_USD_PER_DOLLAR,
  MIN_CREDIT_PURCHASE_AMOUNT_MICRO_USD,
} from "@app/lib/metronome/types";
import { CURRENCY_SYMBOLS, isSupportedCurrency } from "@app/types/currency";
import type { StripePricingData } from "@app/types/stripe/pricing";
import {
  ActionCreditCoinsIcon,
  Button,
  CheckCircleIcon,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ExternalLinkIcon,
  Icon,
  Input,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  XCircleIcon,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

type PurchaseState = "idle" | "processing" | "success" | "redirect" | "error";
type TopUpTab = "one-time" | "automatic";

const QUICK_SELECT_AMOUNTS_DOLLARS = [10, 50, 100] as const;

const supportEmail = config.getSupportEmailAddress().email;

function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString("en-US");
}

function formatCost(amount: number): string {
  if (Number.isInteger(amount)) {
    return amount.toLocaleString("en-US");
  }
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface CreditValueProps {
  credits: number;
}

function CreditValue({ credits }: CreditValueProps) {
  return (
    <span className="flex items-center gap-1">
      <Icon
        visual={ActionCreditCoinsIcon}
        size="xs"
        className="text-muted-foreground dark:text-muted-foreground-night"
      />
      {formatCredits(credits)}
    </span>
  );
}

interface SummaryRowProps {
  label: string;
  value: React.ReactNode;
  dimmed?: boolean;
}

function SummaryRow({ label, value, dimmed = false }: SummaryRowProps) {
  const cls = dimmed
    ? "text-sm text-muted-foreground dark:text-muted-foreground-night"
    : "text-sm text-foreground dark:text-foreground-night";
  return (
    <div className="flex items-center justify-between">
      <span className={cls}>{label}</span>
      <span className={cls}>{value}</span>
    </div>
  );
}

interface BuyAwuCreditsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchaseSuccess?: () => void;
  workspaceId: string;
  currency: string;
  discountPercent: number;
  creditPricing: StripePricingData | null;
  creditPurchaseLimits: CreditPurchaseLimits | null;
  currentBalanceCredits?: number;
}

export function BuyAwuCreditsDialog({
  isOpen,
  onClose,
  onPurchaseSuccess,
  workspaceId,
  currency,
  discountPercent,
  creditPricing,
  creditPurchaseLimits,
  currentBalanceCredits,
}: BuyAwuCreditsDialogProps) {
  const [amountDollars, setAmountDollars] = useState<string>("");
  const [selectedTab, setSelectedTab] = useState<TopUpTab>("one-time");
  const [purchaseState, setPurchaseState] = useState<PurchaseState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  const resetModalStateAndClose = useCallback(() => {
    setAmountDollars("");
    setSelectedTab("one-time");
    setPurchaseState("idle");
    setErrorMessage("");
    setPaymentUrl(null);
    onClose();
  }, [onClose]);

  const maxAmountDollars = useMemo(() => {
    if (!creditPurchaseLimits?.canPurchase) {
      return null;
    }
    return Math.floor(
      creditPurchaseLimits.maxAmountMicroUsd / MICRO_USD_PER_DOLLAR
    );
  }, [creditPurchaseLimits]);

  const maxAmountFormatted = useMemo(() => {
    if (!creditPurchaseLimits?.canPurchase) {
      return null;
    }
    return `$${Math.floor(creditPurchaseLimits.maxAmountMicroUsd / MICRO_USD_PER_DOLLAR).toLocaleString()}`;
  }, [creditPurchaseLimits]);

  const effectiveMaxDollars =
    maxAmountDollars ??
    Math.floor(MAX_CREDIT_PURCHASE_AMOUNT_MICRO_USD / MICRO_USD_PER_DOLLAR);

  const setAmountWithClamp = useCallback(
    (dollars: number) => {
      setAmountDollars(String(Math.min(dollars, effectiveMaxDollars)));
    },
    [effectiveMaxDollars]
  );

  const parsedAmount = parseFloat(amountDollars) || 0;
  const isValidAmount = parsedAmount > 0;
  const amountExceedsMax = parsedAmount > effectiveMaxDollars;
  const addedCredits = parsedAmount * AWU_CREDITS_PER_DOLLAR;

  const displayCurrency = isSupportedCurrency(currency) ? currency : "usd";
  const currencySymbol = CURRENCY_SYMBOLS[displayCurrency];
  const needsConversion = displayCurrency !== "usd";

  let amountInDisplayCurrency = parsedAmount;
  if (needsConversion && creditPricing) {
    const usdUnit = creditPricing.currencyOptions.usd?.unitAmount ?? 0;
    const displayUnit =
      creditPricing.currencyOptions[displayCurrency]?.unitAmount ?? 0;
    if (usdUnit > 0 && displayUnit > 0) {
      amountInDisplayCurrency = parsedAmount * (displayUnit / usdUnit);
    }
  }

  const effectiveDiscount = discountPercent || 0;
  const discountAmount = amountInDisplayCurrency * (effectiveDiscount / 100);
  const totalInDisplayCurrency = amountInDisplayCurrency - discountAmount;

  const canPurchase = isValidAmount && !amountExceedsMax;

  // TODO: implement AWU-specific purchase endpoint.
  const handlePurchase = async () => {
    setPurchaseState("success");
    onPurchaseSuccess?.();
  };

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
                Please complete the payment to finalize your credit purchase or
                contact support to cancel pending invoices.
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

      default: {
        return (
          <div className="flex flex-col gap-4">
            <Tabs
              value={selectedTab}
              onValueChange={(v) => setSelectedTab(v as TopUpTab)}
            >
              <TabsList>
                <TabsTrigger value="one-time" label="One time top-up" />
                <TabsTrigger value="automatic" label="Automatic top-up" />
              </TabsList>

              <TabsContent value="one-time">
                <div className="flex flex-col gap-4 pt-4">
                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="amount"
                      className="text-sm font-medium text-foreground dark:text-foreground-night"
                    >
                      Top up
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground-night">
                          $
                        </span>
                        <Input
                          id="amount"
                          type="number"
                          placeholder="0"
                          value={amountDollars}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              setAmountWithClamp(val);
                            } else {
                              setAmountDollars(e.target.value);
                            }
                          }}
                          min="0"
                          max={effectiveMaxDollars}
                          step="1"
                          className="w-32 pl-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </div>
                      {isValidAmount && (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
                          {formatCredits(addedCredits)} credit
                          <Icon visual={ActionCreditCoinsIcon} size="xs" />
                        </span>
                      )}
                      <div className="ml-auto flex gap-2">
                        {QUICK_SELECT_AMOUNTS_DOLLARS.map((amount) => (
                          <Button
                            key={amount}
                            label={`$${amount}`}
                            variant="outline"
                            size="sm"
                            onClick={() => setAmountWithClamp(amount)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {isValidAmount && (
                    <div className="flex flex-col gap-2 rounded-xl bg-muted-background p-4 dark:bg-muted-background-night">
                      <p className="font-semibold text-foreground dark:text-foreground-night">
                        Summary
                      </p>
                      {currentBalanceCredits !== undefined && (
                        <SummaryRow
                          label="Current Balance"
                          value={
                            <CreditValue credits={currentBalanceCredits} />
                          }
                          dimmed
                        />
                      )}
                      <SummaryRow
                        label="Added balance"
                        value={<CreditValue credits={addedCredits} />}
                        dimmed
                      />
                      <div className="py-1" />
                      {currentBalanceCredits !== undefined && (
                        <SummaryRow
                          label="New balance"
                          value={
                            <CreditValue
                              credits={currentBalanceCredits + addedCredits}
                            />
                          }
                        />
                      )}
                      <SummaryRow
                        label="Cost"
                        value={`${currencySymbol}${formatCost(totalInDisplayCurrency)}`}
                      />
                    </div>
                  )}

                  {maxAmountFormatted && (
                    <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                      Purchase up to {maxAmountFormatted} worth of credits.{" "}
                      <a
                        href={`mailto:${supportEmail}?subject=Higher%20credit%20limit%20request`}
                        className="text-action-500 hover:underline"
                      >
                        Contact support
                      </a>{" "}
                      if you need more.
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="automatic">
                <p className="py-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Automatic top-up is not yet available.
                </p>
              </TabsContent>
            </Tabs>
          </div>
        );
      }
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
              onClick: resetModalStateAndClose,
            }}
          />
        );
      case "redirect":
        return (
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: resetModalStateAndClose,
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
            leftButtonProps={{
              label: "Close",
              variant: "outline",
              onClick: resetModalStateAndClose,
            }}
            rightButtonProps={{
              label: "Manage Invoices",
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
              label="Cancel"
              variant="outline"
              onClick={resetModalStateAndClose}
            />
            <Button
              label={`Add ${formatCredits(addedCredits)} credits`}
              variant="primary"
              onClick={handlePurchase}
              disabled={!canPurchase || selectedTab !== "one-time"}
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
            <DialogTitle>Credit pool top-up</DialogTitle>
            <DialogDescription>
              Credit purchases are not available during your trial period.
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Credit purchases become available once you upgrade to a paid plan.
              If you need credits during your trial, please{" "}
              <a
                href={`mailto:${supportEmail}?subject=Credit%20purchase%20during%20trial`}
                className="text-action-500 hover:underline"
              >
                contact support
              </a>
              .
            </p>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Close",
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
            <DialogTitle>Credit pool top-up</DialogTitle>
            <DialogDescription>
              Credit purchases require an active subscription.
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Please ensure your subscription is active and your payment method
              is up to date. If you need assistance, please{" "}
              <a
                href={`mailto:${supportEmail}?subject=Credit%20purchase%20-%20payment%20issue`}
                className="text-action-500 hover:underline"
              >
                contact support
              </a>
              .
            </p>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Close",
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
            <DialogTitle>Credit pool top-up</DialogTitle>
            <DialogDescription>
              You have pending credit purchases awaiting payment.
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Please complete your pending payment before making a new purchase
              or{" "}
              <a
                href={`mailto:${supportEmail}?subject=Cancel%20pending%20credit%20purchase`}
                className="text-action-500 hover:underline"
              >
                contact support
              </a>{" "}
              to cancel your pending payments.
            </p>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Close",
              variant: "outline",
              onClick: onClose,
            }}
            rightButtonProps={{
              label: "Manage Invoices",
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
    creditPurchaseLimits.maxAmountMicroUsd <
      MIN_CREDIT_PURCHASE_AMOUNT_MICRO_USD
  ) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Credit pool top-up</DialogTitle>
            <DialogDescription>
              You've reached your credit limit for this billing cycle.
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Your credit purchase limit resets at the start of your next
              billing cycle. If you need additional credits before then, please{" "}
              <a
                href={`mailto:${supportEmail}?subject=Credit%20purchase%20limit%20reached`}
                className="text-action-500 hover:underline"
              >
                contact support
              </a>
              .
            </p>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Close",
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
          <DialogTitle>Credit pool top-up</DialogTitle>
          <DialogDescription>Add credit to your credit pool.</DialogDescription>
        </DialogHeader>
        <DialogContainer>{renderContent()}</DialogContainer>
        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
}
