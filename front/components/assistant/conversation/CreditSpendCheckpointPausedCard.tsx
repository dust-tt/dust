import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import type { CreditSpendCheckpointDecision } from "@app/lib/api/assistant/conversation/credit_spend_checkpoint_pause";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useValidateAction } from "@app/lib/swr/tool_actions";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  Avatar,
  Button,
  Card,
  Check,
  PieChart01,
  XClose,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface CreditSpendCheckpointPausedCardProps {
  owner: LightWorkspaceType;
  conversationId: string;
  messageId: string;
  triggeringUser: UserType | null;
  // Only known from the live stream event; null after a page refresh.
  thresholdAwuCredits: number | null;
}

export function CreditSpendCheckpointPausedCard({
  owner,
  conversationId,
  messageId,
  triggeringUser,
  thresholdAwuCredits,
}: CreditSpendCheckpointPausedCardProps) {
  const { user } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittingDecision, setSubmittingDecision] =
    useState<CreditSpendCheckpointDecision | null>(null);
  const [resolved, setResolved] = useState(false);

  const { validateAction } = useValidateAction({
    owner,
    onError: setErrorMessage,
  });

  const canCurrentUserRespond = canCurrentUserRespondToParentUserMessage({
    parentUserId: triggeringUser?.sId,
    currentUserId: user?.sId,
  });

  const handleDecision = async (decision: CreditSpendCheckpointDecision) => {
    setErrorMessage(null);
    setSubmittingDecision(decision);
    const { success } = await validateAction({
      contextType: "credit_spend_checkpoint",
      conversationId,
      messageId,
      decision,
    });
    setSubmittingDecision(null);
    if (success) {
      setResolved(true);
    }
  };

  // The message updates on its own once the loop resumes or stops; hide right away meanwhile.
  if (resolved) {
    return null;
  }

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

      {canCurrentUserRespond ? (
        <>
          {errorMessage && (
            <div className="text-sm font-medium text-warning-800">
              {errorMessage}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              label="No, stop"
              variant="outline"
              icon={XClose}
              disabled={submittingDecision !== null}
              isLoading={submittingDecision === "decline"}
              onClick={() => void handleDecision("decline")}
            />
            <Button
              label="Yes, continue"
              variant="highlight"
              icon={Check}
              disabled={submittingDecision !== null}
              isLoading={submittingDecision === "continue"}
              onClick={() => void handleDecision("continue")}
            />
          </div>
        </>
      ) : (
        <div className="text-sm text-muted-foreground">
          Waiting for{" "}
          <span className="font-semibold text-foreground">
            {triggeringUser?.fullName}
          </span>{" "}
          to decide whether to continue.
        </div>
      )}
    </Card>
  );
}
