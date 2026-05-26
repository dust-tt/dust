import { useAwuPurchase } from "@app/hooks/useAwuPurchase";
import config from "@app/lib/api/config";
import type { AwuPurchaseInfo } from "@app/lib/credits/awu_purchase";
import {
  MAX_AWU_PURCHASE_CREDITS_PER_CYCLE,
  MIN_AWU_PURCHASE_CREDITS,
} from "@app/lib/credits/awu_purchase_constants";
import {
  awuCreditsToCurrency,
  currencyToAwuCredits,
} from "@app/lib/metronome/amounts";
import { useAwuPurchaseStatus } from "@app/lib/swr/credits";
import { CURRENCY_SYMBOLS } from "@app/types/currency";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
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
  Icon,
  Input,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  XCircleIcon,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

type PurchaseState = "idle" | "processing" | "success" | "error";
type TopUpTab = "one-time" | "automatic";

const QUICK_SELECT_AMOUNTS = [10, 50, 100] as const;

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
  awuPurchaseInfo: AwuPurchaseInfo | null;
  isAwuPurchaseInfoLoading: boolean;
  currentBalanceCredits?: number;
}

export function BuyAwuCreditsDialog({
  isOpen,
  onClose,
  onPurchaseSuccess,
  workspaceId,
  awuPurchaseInfo,
  isAwuPurchaseInfoLoading,
  currentBalanceCredits,
}: BuyAwuCreditsDialogProps) {
  const [amountInput, setAmountInput] = useState<string>("");
  const [selectedTab, setSelectedTab] = useState<TopUpTab>("one-time");
  const [purchaseState, setPurchaseState] = useState<PurchaseState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  // Ignore polled attempts older than the one we just started, so a cached
  // "succeeded" entry from a previous purchase can't flash through.
  const [purchaseStartedAtMs, setPurchaseStartedAtMs] = useState<number | null>(
    null
  );
  const { purchaseAwuCredits } = useAwuPurchase({ workspaceId });

  // Poll the payment-gated commit status only while waiting on the webhook
  // outcome. The Metronome -> Stripe payment is async, so the dialog can't
  // know success/failure from the POST response alone.
  const { attempt, mutateAwuPurchaseStatus } = useAwuPurchaseStatus({
    workspaceId,
    disabled: !isOpen || purchaseState !== "processing",
  });

  useEffect(() => {
    if (purchaseState !== "processing" || !attempt) {
      return;
    }
    if (
      purchaseStartedAtMs !== null &&
      attempt.createdAtMs < purchaseStartedAtMs
    ) {
      return;
    }
    switch (attempt.status) {
      case "succeeded":
        setPurchaseState("success");
        onPurchaseSuccess?.();
        break;
      case "failed":
        setErrorMessage(attempt.errorMessage ?? "Payment failed.");
        setPurchaseState("error");
        break;
      case "pending":
        break;
      default:
        assertNeverAndIgnore(attempt.status);
    }
  }, [attempt, purchaseState, purchaseStartedAtMs, onPurchaseSuccess]);

  const resetModalStateAndClose = useCallback(() => {
    setAmountInput("");
    setSelectedTab("one-time");
    setPurchaseState("idle");
    setErrorMessage("");
    setPurchaseStartedAtMs(null);
    onClose();
  }, [onClose]);

  const currency = awuPurchaseInfo?.canPurchase
    ? awuPurchaseInfo.currency
    : "usd";
  const currencySymbol = CURRENCY_SYMBOLS[currency];
  const discountPercent = awuPurchaseInfo?.canPurchase
    ? awuPurchaseInfo.discountPercent
    : 0;

  // The cycle cap is denominated in credits, so the matching cap in
  // currency at the discounted rate is `credits × price_per_credit × (1 - d/100)`.
  const maxAmountInCurrency = useMemo(() => {
    if (!awuPurchaseInfo?.canPurchase) {
      return null;
    }
    return Math.floor(
      awuCreditsToCurrency(awuPurchaseInfo.remainingCycleCredits, currency) *
        (1 - discountPercent / 100)
    );
  }, [awuPurchaseInfo, currency, discountPercent]);

  const maxAmountFormatted = useMemo(() => {
    if (maxAmountInCurrency === null) {
      return null;
    }
    return `${currencySymbol}${maxAmountInCurrency.toLocaleString()}`;
  }, [maxAmountInCurrency, currencySymbol]);

  const effectiveMaxAmount =
    maxAmountInCurrency ??
    Math.floor(
      awuCreditsToCurrency(MAX_AWU_PURCHASE_CREDITS_PER_CYCLE, currency)
    );

  const setAmountWithClamp = useCallback(
    (amount: number) => {
      setAmountInput(String(Math.min(amount, effectiveMaxAmount)));
    },
    [effectiveMaxAmount]
  );

  const parsedAmount = parseFloat(amountInput) || 0;
  const isValidAmount = parsedAmount > 0;
  const amountExceedsMax = parsedAmount > effectiveMaxAmount;
  // The user types what they want to spend; the discount means they get
  // more credits at the same spend (credits_per_full_price / (1 - d/100)).
  const addedCredits =
    currencyToAwuCredits(parsedAmount, currency) / (1 - discountPercent / 100);

  const canPurchase = isValidAmount && !amountExceedsMax;

  const handlePurchase = async () => {
    setPurchaseStartedAtMs(Date.now());
    setPurchaseState("processing");
    const amountCredits = Math.round(addedCredits);
    const result = await purchaseAwuCredits(amountCredits);
    switch (result.status) {
      case "success":
        // The Metronome commit is created but payment is still being
        // attempted asynchronously. Stay in "processing" and let the
        // status poll flip us to success or error based on the
        // payment_gate.payment_status webhook outcome.
        void mutateAwuPurchaseStatus();
        break;
      case "error":
        setErrorMessage(result.message);
        setPurchaseState("error");
        break;
      default:
        assertNeverAndIgnore(result);
    }
  };

  const renderContent = () => {
    switch (purchaseState) {
      case "processing":
        return (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Spinner size="lg" />
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Processing payment...
            </p>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              This may take a few seconds.
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
                <TabsTrigger value="one-time" label="One-time top-up" />
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
                          {currencySymbol}
                        </span>
                        <Input
                          id="amount"
                          type="number"
                          placeholder="0"
                          value={amountInput}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              setAmountWithClamp(val);
                            } else {
                              setAmountInput(e.target.value);
                            }
                          }}
                          min="0"
                          max={effectiveMaxAmount}
                          step="1"
                          className="w-32 pl-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                      </div>
                      {isValidAmount && (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
                          {formatCredits(addedCredits)} credits
                          <Icon visual={ActionCreditCoinsIcon} size="xs" />
                        </span>
                      )}
                      <div className="ml-auto flex gap-2">
                        {QUICK_SELECT_AMOUNTS.map((amount) => (
                          <Button
                            key={amount}
                            label={`${currencySymbol}${amount}`}
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
                          label="Current balance"
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
                        value={`${currencySymbol}${formatCost(parsedAmount)}`}
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
      case "error":
        return (
          <DialogFooter
            leftButtonProps={{
              label: "Close",
              variant: "outline",
              onClick: resetModalStateAndClose,
            }}
            rightButtonProps={{
              label: "Manage invoices",
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

  if (isAwuPurchaseInfoLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Workspace Credits Pool top-up</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
          </DialogContainer>
        </DialogContent>
      </Dialog>
    );
  }

  // Once a purchase is in flight (processing / success / error), drive the
  // dialog from local state and ignore the refreshed awuPurchaseInfo — the
  // just-created Metronome commit would otherwise flip it to
  // `pending_purchase` and bump the user off the success screen.
  const isPurchaseInFlight = purchaseState !== "idle";

  // Cannot purchase: legacy plan.
  if (
    !isPurchaseInFlight &&
    awuPurchaseInfo &&
    !awuPurchaseInfo.canPurchase &&
    awuPurchaseInfo.reason === "legacy_plan"
  ) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Workspace Credits Pool top-up</DialogTitle>
            <DialogDescription>
              Credit purchases are not available for your current plan.
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Please{" "}
              <a
                href={`mailto:${supportEmail}?subject=Credit%20purchase`}
                className="text-action-500 hover:underline"
              >
                contact support
              </a>{" "}
              for assistance.
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

  // Cannot purchase: no Stripe customer.
  if (
    !isPurchaseInFlight &&
    awuPurchaseInfo &&
    !awuPurchaseInfo.canPurchase &&
    awuPurchaseInfo.reason === "no_stripe_customer"
  ) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Workspace Credits Pool top-up</DialogTitle>
            <DialogDescription>
              No billing configuration found for this workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Please{" "}
              <a
                href={`mailto:${supportEmail}?subject=Credit%20purchase%20-%20billing%20setup`}
                className="text-action-500 hover:underline"
              >
                contact support
              </a>{" "}
              to set up billing for your workspace.
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
    !isPurchaseInFlight &&
    awuPurchaseInfo &&
    !awuPurchaseInfo.canPurchase &&
    awuPurchaseInfo.reason === "pending_purchase"
  ) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Workspace Credits Pool top-up</DialogTitle>
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
              label: "Manage invoices",
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
    !isPurchaseInFlight &&
    awuPurchaseInfo?.canPurchase &&
    awuPurchaseInfo.remainingCycleCredits < MIN_AWU_PURCHASE_CREDITS
  ) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Workspace Credits Pool top-up</DialogTitle>
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
          <DialogTitle>Workspace Credits Pool top-up</DialogTitle>
          <DialogDescription>
            Add credits to your Workspace Credits Pool.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>{renderContent()}</DialogContainer>
        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
}
