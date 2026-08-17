import {
  getToolOverride,
  getToolValidationAlwaysAllowLabel,
} from "@app/components/actions/blocked/toolValidationLabels";
import { ToolValidationDetails } from "@app/components/assistant/conversation/ToolValidationDetails";
import { getIcon } from "@app/components/resources/resources_icons";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  Avatar,
  Button,
  Card,
  Check,
  Checkbox,
  Label,
  PieChart01,
  XClose,
} from "@dust-tt/sparkle";
import { useState } from "react";

// Display data needed to render a tool validation card, for both agent-loop and sandbox-function
// blocked tool executions.
type ToolValidationRequest = Pick<
  BlockedToolExecution,
  | "actionId"
  | "userId"
  | "stake"
  | "inputs"
  | "metadata"
  | "approvalArgsLabel"
  | "argumentsRequiringApproval"
>;

type ApprovalProgressProps = {
  current: number;
  total: number;
};

function ApprovalProgress({ current, total }: ApprovalProgressProps) {
  if (total <= 1) {
    return null;
  }

  return (
    <div className="heading-xs shrink-0 text-muted-foreground">
      <span className="sr-only">
        Approval {current} of {total}
      </span>
      <span aria-hidden="true">
        {current}/{total}
      </span>
    </div>
  );
}

interface ToolValidationCardProps {
  validationRequest: ToolValidationRequest;
  approvalProgress?: ApprovalProgressProps;
  triggeringUser: UserType | null;
  // The viewer looking at the card. Passed in rather than read from `AuthContext` because shared
  // frames render this card outside of any AuthProvider.
  currentUser: UserType;
  owner: LightWorkspaceType;
  conversationId?: string | null;
  errorMessage: string | null;
  isValidating: boolean;
  isPulsing?: boolean;
  // Submits the user's decision; returns whether the submission succeeded.
  onValidate: (approved: MCPValidationOutputType) => Promise<boolean>;
}

export function ToolValidationCard({
  validationRequest,
  approvalProgress,
  triggeringUser,
  currentUser,
  owner,
  conversationId,
  errorMessage,
  isValidating,
  isPulsing = false,
  onValidate,
}: ToolValidationCardProps) {
  const [neverAskAgain, setNeverAskAgain] = useState(false);
  const [submittingDecision, setSubmittingDecision] = useState<
    "approved" | "rejected" | null
  >(null);

  const canCurrentUserRespond = canCurrentUserRespondToParentUserMessage({
    parentUserId: validationRequest.userId,
    currentUserId: currentUser.sId,
  });

  const icon = validationRequest.metadata.icon
    ? getIcon(validationRequest.metadata.icon)
    : undefined;

  const handleValidation = async (approved: "approved" | "rejected") => {
    setSubmittingDecision(approved);
    try {
      const success = await onValidate(
        approved === "approved" && neverAskAgain ? "always_approved" : approved
      );
      if (success) {
        setNeverAskAgain(false);
      }
    } finally {
      setSubmittingDecision(null);
    }
  };

  const toolOverride = getToolOverride(validationRequest.metadata);
  const isSubmitting = isValidating || submittingDecision !== null;
  const {
    metadata: { agentName, mcpServerName },
  } = validationRequest;

  return (
    <Card
      variant="secondary"
      containerClassName="w-full max-w-xl"
      className="flex-col p-0 shadow"
      isPulsing={isPulsing}
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar icon={icon ?? PieChart01} size="sm" />
          <div className="heading-base min-w-0 wrap-break-word">
            {`Allow ${agentName} to use ${asDisplayName(mcpServerName)}?`}
          </div>
        </div>
        {approvalProgress && <ApprovalProgress {...approvalProgress} />}
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="text-base">
          {validationRequest.metadata.displayLabel ??
            asDisplayName(validationRequest.metadata.toolName)}
        </div>
        {canCurrentUserRespond ? (
          <>
            {Object.keys(validationRequest.inputs).length > 0 && (
              <ToolValidationDetails
                blockedAction={validationRequest}
                user={currentUser}
                owner={owner}
                conversationId={conversationId}
                defaultExpanded={toolOverride?.detailsExpanded}
              />
            )}
            {errorMessage && (
              <div className="text-sm font-medium text-warning-800">
                {errorMessage}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm wrap-break-word text-muted-foreground">
            Waiting for{" "}
            <span className="font-semibold text-foreground">
              {triggeringUser?.fullName}
            </span>{" "}
            to confirm.
          </div>
        )}
      </div>

      {canCurrentUserRespond && (
        <div className="flex flex-col gap-3 px-4 pb-3 pt-2 sm:flex-row sm:items-center">
          {(validationRequest.stake === "low" ||
            validationRequest.stake === "medium") && (
            <Label
              htmlFor={`never-ask-again-${validationRequest.actionId}`}
              className="flex min-h-11 cursor-pointer items-center gap-2 px-1 sm:min-h-0"
            >
              <Checkbox
                id={`never-ask-again-${validationRequest.actionId}`}
                checked={neverAskAgain}
                disabled={isSubmitting}
                onCheckedChange={(check) => {
                  setNeverAskAgain(!!check);
                }}
              />
              <span className="font-normal">
                {getToolValidationAlwaysAllowLabel(validationRequest)}
              </span>
            </Label>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button
              label="Decline"
              variant="outline"
              size="xs"
              icon={XClose}
              disabled={isSubmitting}
              isLoading={submittingDecision === "rejected"}
              onClick={() => void handleValidation("rejected")}
            />
            <Button
              label={toolOverride?.approveLabel ?? "Allow"}
              variant="highlight"
              size="xs"
              icon={Check}
              disabled={isSubmitting}
              isLoading={submittingDecision === "approved"}
              onClick={() => void handleValidation("approved")}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
