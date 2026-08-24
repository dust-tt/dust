import { POOL_OPTIONS } from "@app/components/workspace/analytics/automations/trigger_pool_options";
import type { TriggerExecutionMode } from "@app/types/assistant/triggers";
import { isTriggerExecutionMode } from "@app/types/assistant/triggers";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  RadioGroup,
  RadioGroupItem,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface BulkTriggerPoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerCount: number;
  onValidate: (executionMode: TriggerExecutionMode) => Promise<boolean>;
}

export function BulkTriggerPoolModal({
  isOpen,
  onClose,
  triggerCount,
  onValidate,
}: BulkTriggerPoolModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        {isOpen && (
          <BulkTriggerPoolForm
            onClose={onClose}
            triggerCount={triggerCount}
            onValidate={onValidate}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface BulkTriggerPoolFormProps {
  onClose: () => void;
  triggerCount: number;
  onValidate: (executionMode: TriggerExecutionMode) => Promise<boolean>;
}

function BulkTriggerPoolForm({
  onClose,
  triggerCount,
  onValidate,
}: BulkTriggerPoolFormProps) {
  const [executionMode, setExecutionMode] =
    useState<TriggerExecutionMode>("workspace_pool");
  const [isSaving, setIsSaving] = useState(false);

  async function handleValidate() {
    setIsSaving(true);
    try {
      const ok = await onValidate(executionMode);
      if (ok) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Set the pool for {triggerCount.toLocaleString("en-US")} automations
        </DialogTitle>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Runs are billed to the workspace&apos;s credits, or to the credits of
          the member who owns each automation.
        </p>
      </DialogHeader>
      <DialogContainer>
        <RadioGroup
          value={executionMode}
          onValueChange={(value) => {
            if (isTriggerExecutionMode(value)) {
              setExecutionMode(value);
            }
          }}
          className="flex flex-col gap-3"
        >
          {POOL_OPTIONS.map(({ value, label }) => (
            <RadioGroupItem
              key={value}
              value={value}
              id={`bulk-trigger-pool-${value}`}
              label={label}
            />
          ))}
        </RadioGroup>
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
          disabled: isSaving,
          onClick: handleValidate,
        }}
      />
    </>
  );
}
