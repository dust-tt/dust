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
  CheckDouble,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

interface ToolValidationDetailsDialogProps {
  validationRequest: ToolValidationRequest;
  approvalTitle: string;
  displayLabel: string;
  icon: React.ComponentProps<typeof Avatar>["icon"];
  currentUser: UserType;
  owner: LightWorkspaceType;
  conversationId?: string | null;
  isSubmitting: boolean;
}

function ToolValidationDetailsDialog({
  validationRequest,
  approvalTitle,
  displayLabel,
  icon,
  currentUser,
  owner,
  conversationId,
  isSubmitting,
}: ToolValidationDetailsDialogProps) {
  const toolOverride = getToolOverride(validationRequest.metadata);

  return (
    <Dialog defaultOpen={toolOverride?.detailsOpen ?? false}>
      <DialogTrigger asChild>
        <Button
          label="Review details"
          variant="ghost"
          size="sm"
          className="min-h-11 sm:min-h-0"
          disabled={isSubmitting}
        />
      </DialogTrigger>
      <DialogContent
        size="lg"
        className="gap-4 p-5"
        preventAutoFocusOnClose={false}
      >
        <DialogHeader className="gap-1 p-0">
          <DialogTitle visual={<Avatar icon={icon} size="sm" />}>
            {approvalTitle}
          </DialogTitle>
          <DialogDescription className="pl-11">
            {displayLabel}
          </DialogDescription>
        </DialogHeader>
        <DialogContainer className="p-0">
          <ToolValidationDetails
            blockedAction={validationRequest}
            user={currentUser}
            owner={owner}
            conversationId={conversationId}
          />
        </DialogContainer>
      </DialogContent>
    </Dialog>
  );
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
  const toolOverride = getToolOverride(validationRequest.metadata);
  const [submittingDecision, setSubmittingDecision] =
    useState<MCPValidationOutputType | null>(null);
  const isSubmitting = isValidating || submittingDecision !== null;

  const canCurrentUserRespond = canCurrentUserRespondToParentUserMessage({
    parentUserId: validationRequest.userId,
    currentUserId: currentUser.sId,
  });

  const icon = validationRequest.metadata.icon
    ? getIcon(validationRequest.metadata.icon)
    : undefined;

  const handleValidation = async (approvalState: MCPValidationOutputType) => {
    setSubmittingDecision(approvalState);
    try {
      await onValidate(approvalState);
    } finally {
      setSubmittingDecision(null);
    }
  };

  const {
    metadata: { agentName, mcpServerName },
  } = validationRequest;
  const approvalTitle = `Allow ${agentName} to use ${asDisplayName(mcpServerName)}?`;
  const displayLabel =
    validationRequest.metadata.displayLabel ??
    asDisplayName(validationRequest.metadata.toolName);
  const hasDetails =
    canCurrentUserRespond && Object.keys(validationRequest.inputs).length > 0;
  const canAlwaysAllow = ["low", "medium"].includes(
    validationRequest.stake ?? ""
  );
  const approveLabel = toolOverride?.approveLabel ?? "Allow";
  const approveOnceLabel = canAlwaysAllow
    ? `${approveLabel} once`
    : approveLabel;
  const alwaysAllowScopeLabel =
    validationRequest.stake === "medium"
      ? getToolValidationAlwaysAllowLabel(validationRequest)
      : null;

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
            {approvalTitle}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {approvalProgress && <ApprovalProgress {...approvalProgress} />}
          {hasDetails && (
            <ToolValidationDetailsDialog
              validationRequest={validationRequest}
              approvalTitle={approvalTitle}
              displayLabel={displayLabel}
              icon={icon ?? PieChart01}
              currentUser={currentUser}
              owner={owner}
              conversationId={conversationId}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="text-base">{displayLabel}</div>
        {canCurrentUserRespond ? (
          <>
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
        <div className="flex flex-wrap justify-end gap-2 px-4 pb-3 pt-2">
          <Button
            label="Decline"
            variant="outline"
            icon={XClose}
            disabled={isSubmitting}
            isLoading={submittingDecision === "rejected"}
            onClick={() => void handleValidation("rejected")}
          />
          <Button
            label={approveOnceLabel}
            variant="highlight"
            icon={Check}
            disabled={isSubmitting}
            isLoading={submittingDecision === "approved"}
            onClick={() => void handleValidation("approved")}
          />
          {canAlwaysAllow && (
            <Button
              label="Always allow"
              variant="highlight"
              icon={CheckDouble}
              tooltip={alwaysAllowScopeLabel ?? undefined}
              disabled={isSubmitting}
              isLoading={submittingDecision === "always_approved"}
              onClick={() => void handleValidation("always_approved")}
            />
          )}
        </div>
      )}
    </Card>
  );
}
