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

interface BuyCreditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  creditPurchaseLimits: CreditPurchaseLimits | null;
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

  const amountExceedsMax = useMemo(() => {
    if (!maxAmountDollars) {
      return false;
    }
    const amount = parseFloat(amountDollars);
    return !isNaN(amount) && amount > maxAmountDollars;
  }, [amountDollars, maxAmountDollars]);

  const handlePurchase = async () => {
    const amount = parseFloat(amountDollars);
    await purchaseCredits(amount);
    onClose();
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
            <DialogTitle>Purchase Programmatic Credits</DialogTitle>
            <DialogDescription>
              Credit purchases are not available during your trial period.
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Credit purchases become available once you upgrade to a paid
                plan. If you need credits during your trial, please contact our
                support team.
              </p>
              <Button
                label={`Contact ${SUPPORT_EMAIL}`}
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
                isError={amountExceedsMax}
                message={
                  amountExceedsMax
                    ? `Maximum purchase amount is ${maxAmountFormatted}`
                    : undefined
                }
              />
            </div>

            {maxAmountFormatted && (
              <p className="text-xs text-muted-foreground">
                Maximum purchase: {maxAmountFormatted} per billing cycle. Need
                more?{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=Higher%20credit%20limit%20request`}
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
            disabled: !amountDollars || amountExceedsMax,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
