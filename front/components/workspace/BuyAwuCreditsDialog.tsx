import {
  CardBrandIcon,
  formatBrandName,
} from "@app/components/checkout/PaymentMethodRow";
import { useAwuPurchase } from "@app/hooks/useAwuPurchase";
import config from "@app/lib/api/config";
import { formatCredits } from "@app/lib/client/credits";
import type { AwuPurchaseInfo } from "@app/lib/credits/awu_purchase";
import {
  MAX_AWU_PURCHASE_CREDITS_PER_CYCLE,
  MIN_AWU_PURCHASE_CREDITS,
} from "@app/lib/credits/awu_purchase_constants";
import {
  awuCreditsToCurrency,
  currencyToAwuCredits,
} from "@app/lib/metronome/amounts";
import { oneYearAfter } from "@app/lib/metronome/constants";
import {
  useAwuPurchaseStatus,
  useRedeemPoolTopupCoupon,
} from "@app/lib/swr/credits";
import { useValidateCoupon } from "@app/lib/swr/workspaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { CouponType } from "@app/types/coupon";
import { CURRENCY_SYMBOLS } from "@app/types/currency";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";
import {
  Button,
  Checkbox,
  CheckCircle,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Hoverable,
  Icon,
  Input,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  XCircle,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

type PurchaseState = "idle" | "processing" | "success" | "error";

// Coupon redemption is synchronous (no payment): idle → checked (after the
// "Check" button validates) → success/error (after "Apply").
type CouponState = "idle" | "checked" | "redeeming" | "success" | "error";

const QUICK_SELECT_AMOUNTS = [50, 100, 200] as const;

const supportEmail = config.getSupportEmailAddress().email;

function formatPaymentMethodLabel(
  pm:
    | { type: "card"; brand: string; last4: string }
    | { type: "sepa_debit"; last4: string }
): string {
  switch (pm.type) {
    case "card":
      return `${formatBrandName(pm.brand)} ${pm.last4}`;
    case "sepa_debit":
      return `IBAN •••• ${pm.last4}`;
    default:
      assertNeverAndIgnore(pm);
      return "";
  }
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
  return <span>{formatCredits(credits)}</span>;
}

interface SummaryRowProps {
  label: string;
  value: React.ReactNode;
  dimmed?: boolean;
}

function SummaryRow({ label, value, dimmed = false }: SummaryRowProps) {
  const cls = dimmed
    ? "text-sm text-muted-foreground"
    : "text-sm text-foreground";
  return (
    <div className="flex items-center justify-between">
      <span className={cls}>{label}</span>
      <span className={cls}>{value}</span>
    </div>
  );
}

interface UseCouponTabProps {
  workspaceId: string;
  currentTotalPoolCredits?: number;
  // Closes the whole dialog.
  onClose: () => void;
  // Notifies the parent (e.g. to refresh the pool) once credits are granted.
  onSuccess?: () => void;
}

// The "Use coupon" tab: a standalone, synchronous flow — enter a code, Check it
// to preview the bonus, then Apply to grant the free credits. Owns its own
// state, independent of the "Buy credits" payment flow.
function UseCouponTab({
  workspaceId,
  currentTotalPoolCredits,
  onClose,
  onSuccess,
}: UseCouponTabProps) {
  const [couponInput, setCouponInput] = useState<string>("");
  const [checkedCoupon, setCheckedCoupon] = useState<CouponType | null>(null);
  const [couponState, setCouponState] = useState<CouponState>("idle");
  const [couponError, setCouponError] = useState<string>("");
  const [isCheckingCoupon, setIsCheckingCoupon] = useState(false);
  const { validateCoupon } = useValidateCoupon({ workspaceId });
  const { redeemPoolTopupCoupon } = useRedeemPoolTopupCoupon({ workspaceId });

  // For a "credits" coupon, `amount` is the number of bonus AWU credits granted.
  const bonusCredits = checkedCoupon?.amount ?? 0;

  // "Check" button: validate the code as a "credits" coupon and surface the
  // bonus it would grant before the user commits.
  const handleCheckCoupon = useCallback(async () => {
    const code = couponInput.trim();
    if (!code) {
      return;
    }
    setCouponError("");
    setIsCheckingCoupon(true);
    try {
      const result = await validateCoupon(code, "credits");
      if (!result.ok) {
        setCheckedCoupon(null);
        setCouponState("idle");
        setCouponError(result.message);
        return;
      }
      setCheckedCoupon(result.coupon);
      setCouponState("checked");
    } finally {
      setIsCheckingCoupon(false);
    }
  }, [couponInput, validateCoupon]);

  // "Apply" button: actually redeem the checked coupon and grant the credits.
  const handleRedeemCoupon = useCallback(async () => {
    if (!checkedCoupon) {
      return;
    }
    setCouponState("redeeming");
    const result = await redeemPoolTopupCoupon(checkedCoupon.code);
    switch (result.status) {
      case "success":
        setCouponState("success");
        onSuccess?.();
        break;
      case "error":
        setCouponError(result.message);
        setCouponState("error");
        break;
      default:
        assertNeverAndIgnore(result);
    }
  }, [checkedCoupon, redeemPoolTopupCoupon, onSuccess]);

  const resetCouponInput = useCallback(() => {
    setCheckedCoupon(null);
    setCouponState("idle");
    setCouponInput("");
    setCouponError("");
  }, []);

  switch (couponState) {
    case "redeeming":
      return (
        <>
          <DialogContainer>
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <Spinner size="lg" />
              <p className="text-sm text-muted-foreground">
                Applying coupon...
              </p>
            </div>
          </DialogContainer>
          <DialogFooter
            rightButtonProps={{
              label: "Applying...",
              variant: "primary",
              disabled: true,
            }}
          />
        </>
      );
    case "success":
      return (
        <>
          <DialogContainer>
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <Icon
                visual={CheckCircle}
                size="lg"
                className="text-success-500"
              />
              <div className="text-center">
                <p className="text-lg font-medium text-foreground">
                  Coupon applied!
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-semibold">
                    {formatCredits(bonusCredits)} credits
                  </span>{" "}
                  have been added to your pool.
                </p>
              </div>
            </div>
          </DialogContainer>
          <DialogFooter
            rightButtonProps={{
              label: "Close",
              variant: "primary",
              onClick: onClose,
            }}
          />
        </>
      );
    case "error":
      return (
        <>
          <DialogContainer>
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <Icon visual={XCircle} size="lg" className="text-warning-500" />
              <div className="text-center">
                <p className="text-lg font-medium text-foreground">
                  Couldn't apply coupon
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {couponError}
                </p>
              </div>
            </div>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Close",
              variant: "outline",
              onClick: onClose,
            }}
            rightButtonProps={{
              label: "Try again",
              variant: "primary",
              onClick: resetCouponInput,
            }}
          />
        </>
      );
    case "idle":
    case "checked":
      return (
        <>
          <DialogContainer>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Have a coupon code? Enter it below to add free credits to your
                Workspace Credits Pool.
              </p>
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="couponCode"
                  className="text-sm font-medium text-foreground"
                >
                  Coupon code
                </label>
                <div className="flex items-start gap-2">
                  <div className="flex flex-col gap-1">
                    <Input
                      id="couponCode"
                      placeholder="Enter code"
                      value={couponInput}
                      onChange={(e) => {
                        setCouponInput(e.target.value);
                        setCouponError("");
                        setCheckedCoupon(null);
                        setCouponState("idle");
                      }}
                      isError={!!couponError}
                      className="w-48"
                    />
                    {couponError && (
                      <span className="text-xs text-warning-500">
                        {couponError}
                      </span>
                    )}
                  </div>
                  <Button
                    label="Check"
                    variant="outline"
                    size="sm"
                    onClick={handleCheckCoupon}
                    disabled={!couponInput.trim() || isCheckingCoupon}
                    isLoading={isCheckingCoupon}
                  />
                </div>
              </div>

              {couponState === "checked" && checkedCoupon && (
                <div className="flex flex-col gap-2 rounded-xl bg-muted-background p-4">
                  <SummaryRow
                    label="Coupon"
                    value={checkedCoupon.code}
                    dimmed
                  />
                  {currentTotalPoolCredits !== undefined && (
                    <SummaryRow
                      label="Current Credits Pool"
                      value={<CreditValue credits={currentTotalPoolCredits} />}
                      dimmed
                    />
                  )}
                  <SummaryRow
                    label="Bonus Credits"
                    value={<CreditValue credits={bonusCredits} />}
                    dimmed
                  />
                  <div className="py-1" />
                  {currentTotalPoolCredits !== undefined && (
                    <SummaryRow
                      label="New Credits Pool"
                      value={
                        <CreditValue
                          credits={currentTotalPoolCredits + bonusCredits}
                        />
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </DialogContainer>
          <DialogFooter>
            <Button label="Cancel" variant="outline" onClick={onClose} />
            <Button
              label="Apply coupon"
              variant="primary"
              onClick={handleRedeemCoupon}
              disabled={couponState !== "checked"}
            />
          </DialogFooter>
        </>
      );
    default:
      return assertNever(couponState);
  }
}

interface BuyAwuCreditsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchaseSuccess?: () => void;
  workspaceId: string;
  awuPurchaseInfo: AwuPurchaseInfo | null;
  isAwuPurchaseInfoLoading: boolean;
  isAwuPurchaseInfoError: boolean;
  currentTotalPoolCredits?: number;
}

export function BuyAwuCreditsDialog({
  isOpen,
  onClose,
  onPurchaseSuccess,
  workspaceId,
  awuPurchaseInfo,
  isAwuPurchaseInfoLoading,
  isAwuPurchaseInfoError,
  currentTotalPoolCredits,
}: BuyAwuCreditsDialogProps) {
  const [amountInput, setAmountInput] = useState<string>("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedNonRefundable, setAcceptedNonRefundable] = useState(false);
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
    setAcceptedTerms(false);
    setAcceptedNonRefundable(false);
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
  const addedCredits = Math.ceil(
    currencyToAwuCredits(parsedAmount, currency) / (1 - discountPercent / 100)
  );

  // Purchased credits expire one year after purchase (see `purchaseAwuCredits`).
  const expirationDateFormatted = useMemo(
    () =>
      formatTimestampToFriendlyDate(
        oneYearAfter(new Date()).getTime(),
        "short"
      ),
    []
  );

  const canPurchase =
    isValidAmount &&
    !amountExceedsMax &&
    acceptedTerms &&
    acceptedNonRefundable;

  const handlePurchase = async () => {
    setPurchaseStartedAtMs(Date.now());
    setPurchaseState("processing");
    const result = await purchaseAwuCredits(addedCredits);
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
            <p className="text-sm text-muted-foreground">
              Processing payment...
            </p>
            <p className="text-xs text-muted-foreground">
              This may take a few seconds.
            </p>
          </div>
        );

      case "success":
        return (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            <Icon visual={CheckCircle} size="lg" className="text-success-500" />
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">
                Credits purchased successfully!
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your credits are now available.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
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
            <Icon visual={XCircle} size="lg" className="text-warning-500" />
            <div className="text-center">
              <p className="text-lg font-medium text-foreground">
                Something went wrong
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {errorMessage}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Please contact support if the issue persists.
              </p>
            </div>
          </div>
        );

      default: {
        return (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="amount"
                  className="text-sm font-medium text-foreground"
                >
                  Amount
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      {currencySymbol}
                    </span>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="0"
                      value={amountInput}
                      onChange={(e) => {
                        setAmountInput(e.target.value);
                      }}
                      min="0"
                      step="1"
                      isError={amountExceedsMax && !!maxAmountFormatted}
                      className="w-32 pl-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                  {isValidAmount && (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      {formatCredits(addedCredits)} credits
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
                {amountExceedsMax && maxAmountFormatted && (
                  <p className="text-xs text-warning-500">
                    Amount exceeds the {maxAmountFormatted} limit. Please{" "}
                    <a
                      href={`mailto:${supportEmail}?subject=Higher%20credit%20limit%20request`}
                      className="underline"
                    >
                      contact support
                    </a>
                    .
                  </p>
                )}
              </div>

              {isValidAmount && !amountExceedsMax && (
                <div className="flex flex-col gap-2 rounded-xl bg-muted-background p-4">
                  <p className="font-semibold text-foreground">Summary</p>
                  {currentTotalPoolCredits !== undefined && (
                    <SummaryRow
                      label="Current Credits Pool"
                      value={<CreditValue credits={currentTotalPoolCredits} />}
                      dimmed
                    />
                  )}
                  <SummaryRow
                    label="Added Credits"
                    value={<CreditValue credits={addedCredits} />}
                    dimmed
                  />
                  <div className="py-1" />
                  {currentTotalPoolCredits !== undefined && (
                    <SummaryRow
                      label="New Credits Pool"
                      value={
                        <CreditValue
                          credits={currentTotalPoolCredits + addedCredits}
                        />
                      }
                    />
                  )}
                  <SummaryRow
                    label="Cost (excl. tax)"
                    value={`${currencySymbol}${formatCost(parsedAmount)}`}
                  />
                </div>
              )}

              {awuPurchaseInfo?.canPurchase &&
                awuPurchaseInfo.paymentMethod && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-foreground">
                      Payment method
                    </p>
                    <div className="flex w-full items-center justify-between rounded-lg border border-separator bg-muted px-4 py-3">
                      <div className="flex items-center gap-3">
                        {awuPurchaseInfo.paymentMethod.type === "card" ? (
                          <CardBrandIcon
                            brand={awuPurchaseInfo.paymentMethod.brand}
                            width={38}
                            height={24}
                          />
                        ) : null}
                        <span className="text-sm font-medium">
                          {formatPaymentMethodLabel(
                            awuPurchaseInfo.paymentMethod
                          )}
                        </span>
                      </div>
                      <Button
                        label="Change"
                        variant="ghost"
                        size="sm"
                        href={`/w/${workspaceId}/subscription/manage`}
                      />
                    </div>
                  </div>
                )}

              <p className="text-xs text-muted-foreground">
                Credits are valid for 12 months: credits purchased today expire
                on {expirationDateFormatted}.
              </p>

              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={acceptedTerms}
                    onCheckedChange={() => setAcceptedTerms(!acceptedTerms)}
                  />
                  <span className="text-sm text-foreground">
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
                  <span className="text-sm text-foreground">
                    I understand credits are non-refundable after purchase
                  </span>
                </label>
              </div>
            </div>
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
              disabled={!canPurchase}
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
            <DialogTitle>Top-up</DialogTitle>
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

  if (!isPurchaseInFlight && isAwuPurchaseInfoError) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Top-up</DialogTitle>
            <DialogDescription>
              We couldn't load your purchase information.
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <Icon visual={XCircle} size="lg" className="text-warning-500" />
              <p className="text-center text-sm text-muted-foreground">
                Something went wrong while loading your top-up options. Please
                try again in a moment, or{" "}
                <a
                  href={`mailto:${supportEmail}?subject=Credit%20purchase%20-%20unable%20to%20load`}
                  className="text-action-500 hover:underline"
                >
                  contact support
                </a>{" "}
                if the issue persists.
              </p>
            </div>
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
            <DialogTitle>Top-up</DialogTitle>
            <DialogDescription>
              Credit purchases are not available for your current plan.
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <p className="text-sm text-muted-foreground">
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
            <DialogTitle>Top-up</DialogTitle>
            <DialogDescription>
              No billing configuration found for this workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <p className="text-sm text-muted-foreground">
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

  // Buy-credits states that only block buying (not coupon redemption). These
  // render inside the "Buy credits" tab so the "Use coupon" tab stays usable.
  const buyPendingBlock =
    !isPurchaseInFlight &&
    !!awuPurchaseInfo &&
    !awuPurchaseInfo.canPurchase &&
    awuPurchaseInfo.reason === "pending_purchase";
  const buyExhaustedBlock =
    !isPurchaseInFlight &&
    !!awuPurchaseInfo?.canPurchase &&
    awuPurchaseInfo.remainingCycleCredits < MIN_AWU_PURCHASE_CREDITS;

  const renderBuyTabBody = () => {
    if (purchaseState === "idle" && buyPendingBlock) {
      return (
        <p className="text-sm text-muted-foreground">
          You have pending credit purchases awaiting payment. Please complete
          your pending payment before making a new purchase or{" "}
          <a
            href={`mailto:${supportEmail}?subject=Cancel%20pending%20credit%20purchase`}
            className="text-action-500 hover:underline"
          >
            contact support
          </a>{" "}
          to cancel your pending payments.
        </p>
      );
    }
    if (purchaseState === "idle" && buyExhaustedBlock) {
      return (
        <p className="text-sm text-muted-foreground">
          You've reached your credit limit for this billing cycle. It resets at
          the start of your next billing cycle. If you need additional credits
          before then, please{" "}
          <a
            href={`mailto:${supportEmail}?subject=Credit%20purchase%20limit%20reached`}
            className="text-action-500 hover:underline"
          >
            contact support
          </a>
          .
        </p>
      );
    }
    return renderContent();
  };

  const renderBuyTabFooter = () => {
    if (purchaseState === "idle" && buyPendingBlock) {
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
    }
    if (purchaseState === "idle" && buyExhaustedBlock) {
      return (
        <DialogFooter
          leftButtonProps={{
            label: "Close",
            variant: "outline",
            onClick: resetModalStateAndClose,
          }}
        />
      );
    }
    return renderFooter();
  };

  // Buy or use a coupon. While a buy is in flight (processing/success/error) the
  // tabs are hidden so the user can't switch away mid-payment.
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && resetModalStateAndClose()}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Top-up</DialogTitle>
        </DialogHeader>
        {isPurchaseInFlight ? (
          <>
            <DialogContainer>{renderContent()}</DialogContainer>
            {renderFooter()}
          </>
        ) : (
          <Tabs defaultValue="buy">
            <TabsList>
              <TabsTrigger value="buy" label="Buy credits" />
              <TabsTrigger value="coupon" label="Use coupon" />
            </TabsList>
            <TabsContent value="buy">
              <DialogContainer>{renderBuyTabBody()}</DialogContainer>
              {renderBuyTabFooter()}
            </TabsContent>
            <TabsContent value="coupon">
              <UseCouponTab
                workspaceId={workspaceId}
                currentTotalPoolCredits={currentTotalPoolCredits}
                onClose={resetModalStateAndClose}
                onSuccess={onPurchaseSuccess}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
