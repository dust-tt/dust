import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import type { GenericErrorContent } from "@app/types/assistant/agent";
import type { UserType } from "@app/types/user";
import { Button, ContentMessage, InfoCircle, Play } from "@dust-tt/sparkle";

interface CreditApprovalRequiredProps {
  error: GenericErrorContent;
  triggeringUser: UserType | null;
  resumeHandler: () => Promise<void>;
}

export function CreditApprovalRequired({
  error,
  triggeringUser,
  resumeHandler,
}: CreditApprovalRequiredProps) {
  const { user } = useAuth();
  const { submit: resume, isSubmitting: isResuming } = useSubmitFunction(
    async () => resumeHandler()
  );

  const canCurrentUserRespond = canCurrentUserRespondToParentUserMessage({
    parentUserId: triggeringUser?.sId,
    currentUserId: user?.sId,
  });

  return (
    <ContentMessage
      title={`${error.metadata?.errorTitle ?? "This message is using a lot of credits"}`}
      variant="golden"
      className="flex flex-col gap-3"
      icon={InfoCircle}
    >
      <div className="whitespace-normal break-words">{error.message}</div>
      {canCurrentUserRespond ? (
        <div className="flex flex-col gap-2 pt-3 sm:flex-row">
          <Button
            variant="outline"
            size="xs"
            icon={Play}
            label="Continue"
            onClick={resume}
            disabled={isResuming}
          />
        </div>
      ) : (
        <div className="pt-3 text-sm text-muted-foreground">
          Waiting for{" "}
          <span className="font-semibold">
            {triggeringUser?.fullName ?? "another user"}
          </span>{" "}
          to decide whether to continue.
        </div>
      )}
    </ContentMessage>
  );
}
