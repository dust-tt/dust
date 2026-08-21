import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";

interface WorkflowAlertThresholdDialogProps {
  isOpen: boolean;
  thresholdAwuCredits: number;
  onContinue: () => void;
  onStop: () => void;
}

// Shown at most once per message, the first time its generation crosses the user's workflow
// alert threshold. "Yes" dismisses and lets the agent keep going; "No" triggers a smooth
// shutdown (the agent finishes its current step, summarizes progress, then stops).
export function WorkflowAlertThresholdDialog({
  isOpen,
  thresholdAwuCredits,
  onContinue,
  onStop,
}: WorkflowAlertThresholdDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onContinue()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Keep going?</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <p>
            This task has used more than{" "}
            {thresholdAwuCredits.toLocaleString("en-US")} credits so far. Do you
            want it to continue?
          </p>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "No, stop",
            variant: "outline",
            onClick: onStop,
          }}
          rightButtonProps={{
            label: "Yes, continue",
            variant: "primary",
            onClick: onContinue,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
