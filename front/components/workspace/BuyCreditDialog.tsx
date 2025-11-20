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

import { useSendNotification } from "@app/hooks/useNotification";
import { purchaseCredits } from "@app/lib/client/credits";
import { useSubmitFunction } from "@app/lib/client/utils";

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
  const sendNotification = useSendNotification();

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setAmountDollars("");
    }
  }, [isOpen]);

  const { submit: handlePurchase, isSubmitting } = useSubmitFunction(
    async () => {
      const amount = parseFloat(amountDollars);
      await purchaseCredits({
        workspaceId,
        amountDollars: amount,
        sendNotification,
      });
      onClose();
    }
  );

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
                disabled={isSubmitting}
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
            disabled: isSubmitting,
          }}
          rightButtonProps={{
            label: isSubmitting ? "Processing..." : "Purchase Credits",
            variant: "primary",
            onClick: handlePurchase,
            disabled: isSubmitting || !amountDollars,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
