import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@dust-tt/sparkle";
import { useState } from "react";

const MIN_AWU_CREDITS = 0;
const MAX_AWU_CREDITS = 2_000_000;

type SpendLimit = { kind: "limited"; awuCredits: number };

interface BulkEditSpendLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberCount: number;
  onValidate: (limit: SpendLimit) => Promise<boolean>;
}

export function BulkEditSpendLimitModal({
  isOpen,
  onClose,
  memberCount,
  onValidate,
}: BulkEditSpendLimitModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        {isOpen && (
          <BulkEditSpendLimitForm
            onClose={onClose}
            memberCount={memberCount}
            onValidate={onValidate}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface BulkEditSpendLimitFormProps {
  onClose: () => void;
  memberCount: number;
  onValidate: (limit: SpendLimit) => Promise<boolean>;
}

function BulkEditSpendLimitForm({
  onClose,
  memberCount,
  onValidate,
}: BulkEditSpendLimitFormProps) {
  const [creditsInput, setCreditsInput] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null
  );

  function handleCreditsChange(value: string) {
    setCreditsInput(value.replace(/[^\d]/g, ""));
    setValidationMessage(null);
  }

  function validate(): SpendLimit | null {
    const parsed = Number(creditsInput);
    if (!Number.isInteger(parsed) || parsed < MIN_AWU_CREDITS) {
      setValidationMessage(
        `Enter a whole number of credits between ${MIN_AWU_CREDITS.toLocaleString("en-US")} and ${MAX_AWU_CREDITS.toLocaleString("en-US")}.`
      );
      return null;
    }
    if (parsed > MAX_AWU_CREDITS) {
      setValidationMessage(
        `Credits cannot exceed ${MAX_AWU_CREDITS.toLocaleString("en-US")}.`
      );
      return null;
    }
    return { kind: "limited", awuCredits: parsed };
  }

  async function handleValidate() {
    const limit = validate();
    if (!limit) {
      return;
    }
    setIsSaving(true);
    try {
      const ok = await onValidate(limit);
      if (ok) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  }

  const validateDisabled = isSaving || creditsInput.length === 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Edit spend limit for {memberCount.toLocaleString("en-US")} members
        </DialogTitle>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          They will be able to consume this amount from the pool after reaching
          their plan usage limit. This limit is added on top of each seat&apos;s
          built-in allowance.
        </p>
      </DialogHeader>
      <DialogContainer>
        <div className="flex flex-col gap-1.5">
          <Input
            id="bulk-spend-credit-limit-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="1,000"
            value={
              creditsInput !== "" ? Number(creditsInput).toLocaleString() : ""
            }
            onChange={(e) => handleCreditsChange(e.target.value)}
            isError={validationMessage !== null}
            message={validationMessage ?? undefined}
            messageStatus={validationMessage !== null ? "error" : undefined}
            className="text-right"
            suffix="credits/month"
          />
        </div>
      </DialogContainer>
      <DialogFooter
        leftButtonProps={{
          label: "Cancel",
          variant: "outline",
          onClick: onClose,
        }}
        rightButtonProps={{
          label: "Validate",
          variant: "primary",
          disabled: validateDisabled,
          onClick: handleValidate,
        }}
      />
    </>
  );
}
