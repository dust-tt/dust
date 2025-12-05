import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { getPriceAsString } from "@app/lib/client/subscription";
import type { CreditPurchaseLimits } from "@app/lib/credits/limits";
import { usePurchaseCredits } from "@app/lib/swr/credits";

const SUPPORT_EMAIL = "support@dust.tt";

const EMAIL_SUBJECTS = {
  TRIAL: "Credit purchase during trial",
  PAYMENT_ISSUE: "Credit purchase - payment issue",
  INQUIRY: "Credit purchase inquiry",
  HIGHER_LIMIT: "Higher credit limit request",
} as const;

interface BuyCreditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  creditPurchaseLimits: CreditPurchaseLimits | null;
}

interface ContactSupportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  message: string;
  emailSubject: string;
}

function ContactSupportDialog({
  isOpen,
  onClose,
  title,
  description,
  message,
  emailSubject,
}: ContactSupportDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button
              label={`Contact ${SUPPORT_EMAIL}`}
              variant="outline"
              onClick={() =>
                window.open(
                  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(emailSubject)}`,
                  "_blank"
                )
              }
            />
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

export function BuyCreditDialog({
  isOpen,
  onClose,
  workspaceId,
  creditPurchaseLimits,
}: BuyCreditDialogProps) {
  const [amountDollars, setAmountDollars] = useState<string>("");
  const { purchaseCredits } = usePurchaseCredits({ workspaceId });

  // Reset state when dialog opens.
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmountDollars("");
    }
  }, [isOpen]);

  const maxAmountDollars = useMemo(() => {
    if (!creditPurchaseLimits || !creditPurchaseLimits.canPurchase) {
      return null;
    }
    return creditPurchaseLimits.maxAmountCents / 100;
  }, [creditPurchaseLimits]);

  const maxAmountFormatted = useMemo(() => {
    if (!creditPurchaseLimits || !creditPurchaseLimits.canPurchase) {
      return null;
    }
    return getPriceAsString({
      currency: "usd",
      priceInCents: creditPurchaseLimits.maxAmountCents,
    });
  }, [creditPurchaseLimits]);

  const parsedAmount = useMemo(() => {
    const amount = parseFloat(amountDollars);
    return isNaN(amount) ? null : amount;
  }, [amountDollars]);

  const amountValidationError = useMemo(() => {
    if (!amountDollars) {
      return null;
    }
    if (parsedAmount === null) {
      return "Please enter a valid number";
    }
    if (parsedAmount <= 0) {
      return "Amount must be greater than 0";
    }
    if (maxAmountDollars !== null && parsedAmount > maxAmountDollars) {
      return `Maximum purchase amount is ${maxAmountFormatted}`;
    }
    return null;
  }, [amountDollars, parsedAmount, maxAmountDollars, maxAmountFormatted]);

  const isValidAmount =
    parsedAmount !== null && parsedAmount > 0 && amountValidationError === null;

  const handlePurchase = async () => {
    if (!isValidAmount) {
      return;
    }
    await purchaseCredits(parsedAmount);
    onClose();
  };

  // Cannot purchase: trialing.
  if (
    creditPurchaseLimits &&
    !creditPurchaseLimits.canPurchase &&
    creditPurchaseLimits.reason === "trialing"
  ) {
    return (
      <ContactSupportDialog
        isOpen={isOpen}
        onClose={onClose}
        title="Purchase Programmatic Credits"
        description="Credit purchases are not available during your trial period."
        message="Credit purchases become available once you upgrade to a paid plan. If you need credits during your trial, please contact our support team."
        emailSubject={EMAIL_SUBJECTS.TRIAL}
      />
    );
  }

  // Cannot purchase: payment issue.
  if (
    creditPurchaseLimits &&
    !creditPurchaseLimits.canPurchase &&
    creditPurchaseLimits.reason === "payment_issue"
  ) {
    return (
      <ContactSupportDialog
        isOpen={isOpen}
        onClose={onClose}
        title="Purchase Programmatic Credits"
        description="Credit purchases require an active subscription."
        message="Please ensure your subscription is active and your payment method is up to date. If you need assistance, please contact our support team."
        emailSubject={EMAIL_SUBJECTS.PAYMENT_ISSUE}
      />
    );
  }

  // No limits available (no Stripe subscription).
  if (!creditPurchaseLimits) {
    return (
      <ContactSupportDialog
        isOpen={isOpen}
        onClose={onClose}
        title="Purchase Programmatic Credits"
        description="Credit purchases require an active subscription."
        message="Please subscribe to a plan to purchase credits. If you need assistance, please contact our support team."
        emailSubject={EMAIL_SUBJECTS.INQUIRY}
      />
    );
  }

  // Can purchase.
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Purchase Programmatic Credits</DialogTitle>
          <DialogDescription>
            Purchase credits for programmatic API usage and integrations.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="amount"
                className="text-sm font-medium text-foreground"
              >
                Amount (USD)
              </label>
              <Input
                id="amount"
                type="number"
                placeholder="10"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                min="1"
                max={maxAmountDollars ?? undefined}
                step="1"
                isError={amountValidationError !== null}
                message={amountValidationError ?? undefined}
              />
            </div>

            {maxAmountFormatted && (
              <p className="text-xs text-muted-foreground">
                Maximum purchase: {maxAmountFormatted} per billing cycle. Need
                more?{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(EMAIL_SUBJECTS.HIGHER_LIMIT)}`}
                  className="text-action-500 hover:underline"
                >
                  Contact support
                </a>
                .
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Credits will be charged immediately.
            </p>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Purchase Credits",
            variant: "primary",
            onClick: handlePurchase,
            disabled: !isValidAmount,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
