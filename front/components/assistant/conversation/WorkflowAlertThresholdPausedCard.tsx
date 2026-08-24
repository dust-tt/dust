import type { WorkflowAlertThresholdDecision } from "@app/lib/swr/workflow_alert_threshold";
import {
  Avatar,
  Button,
  Card,
  Check,
  PieChart01,
  XClose,
} from "@dust-tt/sparkle";

interface WorkflowAlertThresholdPausedCardProps {
  // Only known right after the stream event that triggered the pause; not persisted, so it's
  // absent after a page refresh. The card still works without it (see the fallback copy below).
  thresholdAwuCredits: number | null;
  submittingDecision: WorkflowAlertThresholdDecision | null;
  onContinue: () => void;
  onDecline: () => void;
}

export function WorkflowAlertThresholdPausedCard({
  thresholdAwuCredits,
  submittingDecision,
  onContinue,
  onDecline,
}: WorkflowAlertThresholdPausedCardProps) {
  const isSubmitting = submittingDecision !== null;

  return (
    <Card
      variant="secondary"
      containerClassName="w-full max-w-xl"
      className="flex flex-col shadow gap-4"
    >
      <div className="flex items-center gap-2">
        <Avatar icon={PieChart01} size="sm" />
        <div className="heading-base">Keep going?</div>
      </div>

      <div className="text-base text-muted-foreground">
        {thresholdAwuCredits !== null
          ? `This task has used more than ${thresholdAwuCredits.toLocaleString("en-US")} credits so far and is paused. Continue running it?`
          : "This task is paused because it has used a lot of credits. Continue running it?"}
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <Button
          label="No, stop"
          variant="outline"
          icon={XClose}
          disabled={isSubmitting}
          isLoading={submittingDecision === "decline"}
          onClick={onDecline}
        />
        <Button
          label="Yes, continue"
          variant="highlight"
          icon={Check}
          disabled={isSubmitting}
          isLoading={submittingDecision === "continue"}
          onClick={onContinue}
        />
      </div>
    </Card>
  );
}
