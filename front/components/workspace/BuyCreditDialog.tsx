import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { usePurchaseCredits } from "@app/lib/swr/credits";

interface BuyCreditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  isEnterprise: boolean;
}

export function BuyCreditDialog({
  isOpen,
  onClose,
  workspaceId,
  isEnterprise,
}: BuyCreditDialogProps) {
  const [amountDollars, setAmountDollars] = useState<string>("");
  const { purchaseCredits } = usePurchaseCredits({ workspaceId });

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmountDollars("");
    }
  }, [isOpen]);

  const handlePurchase = async () => {
    const amount = parseFloat(amountDollars);
    await purchaseCredits(amount);
    onClose();
  };

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
                className="text-element-800 text-sm font-medium"
              >
                Amount (USD)
              </label>
              <Input
                id="amount"
                type="number"
                placeholder="10"
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                min="0"
                step="1"
              />
            </div>

            <div className="text-element-700 text-xs">
              {isEnterprise ? (
                <p>
                  Credits will be added immediately and invoiced at the end of
                  your billing cycle.
                </p>
              ) : (
                <p>Credits will be charged immediately.</p>
              )}
            </div>
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
            disabled: !amountDollars,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
