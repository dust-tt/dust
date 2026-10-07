import { POOL_OPTIONS } from "@app/components/workspace/analytics/automations/trigger_pool_options";
import { useTriggerExecutionModes } from "@app/hooks/useTriggerExecutionModes";
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
import { Plural, Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const { canUseExecutionMode } = useTriggerExecutionModes();
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
          <Trans>
            Set the pool for{" "}
            <Plural
              value={triggerCount}
              one="# automation"
              other="# automations"
            />
          </Trans>
        </DialogTitle>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          <Trans>
            Runs are billed to the workspace's credits, or to the credits of the
            member who owns each automation.
          </Trans>
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
              label={t(label)}
              disabled={!canUseExecutionMode(value)}
            />
          ))}
        </RadioGroup>
      </DialogContainer>
      <DialogFooter
        leftButtonProps={{
          label: t`Cancel`,
          variant: "outline",
          onClick: onClose,
        }}
        rightButtonProps={{
          label: t`Validate`,
          variant: "primary",
          disabled: isSaving || !canUseExecutionMode(executionMode),
          onClick: handleValidate,
        }}
      />
    </>
  );
}
