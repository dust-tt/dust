import {
  getToolOverride,
  getToolValidationAlwaysAllowLabel,
  getToolValidationTitle,
} from "@app/components/actions/blocked/toolValidationLabels";
import { ToolValidationDetails } from "@app/components/assistant/conversation/ToolValidationDetails";
import { getIcon } from "@app/components/resources/resources_icons";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  Button,
  Check,
  Checkbox,
  ContentMessage,
  Label,
  XClose,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

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

interface ToolValidationCardProps {
  validationRequest: ToolValidationRequest;
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

  const canCurrentUserRespond = useMemo(
    () =>
      canCurrentUserRespondToParentUserMessage({
        parentUserId: validationRequest.userId,
        currentUserId: currentUser.sId,
      }),
    [validationRequest.userId, currentUser.sId]
  );

  const icon = validationRequest.metadata.icon
    ? getIcon(validationRequest.metadata.icon)
    : undefined;

  const handleValidation = async (approved: "approved" | "rejected") => {
    const success = await onValidate(
      approved === "approved" && neverAskAgain ? "always_approved" : approved
    );
    if (success) {
      setNeverAskAgain(false);
    }
  };

  const toolOverride = getToolOverride(validationRequest.metadata);
  const title = getToolValidationTitle(
    validationRequest,
    canCurrentUserRespond
  );
  const alwaysAllowLabel = getToolValidationAlwaysAllowLabel(validationRequest);

  return (
    <ContentMessage
      title={title}
      variant="primary"
      className="flex w-full flex-col gap-3 sm:w-80 sm:min-w-125"
      icon={icon}
    >
      {canCurrentUserRespond ? (
        <>
          <ToolValidationDetails
            blockedAction={validationRequest}
            user={currentUser}
            owner={owner}
            conversationId={conversationId}
            defaultExpanded={toolOverride?.detailsExpanded}
          />
          {errorMessage && (
            <div className="mt-2 text-sm font-medium text-warning-800">
              {errorMessage}
            </div>
          )}
          <div className="flex flex-col gap-3 sm:mt-3">
            {(validationRequest.stake === "low" ||
              validationRequest.stake === "medium") && (
              <Label
                htmlFor="never-ask-again"
                className="flex w-fit cursor-pointer flex-row items-center gap-2 py-1 pr-2 text-xs"
              >
                <Checkbox
                  id="never-ask-again"
                  checked={neverAskAgain}
                  onCheckedChange={(check) => {
                    setNeverAskAgain(!!check);
                  }}
                />
                <span className="text-normal font-normal">
                  {alwaysAllowLabel}
                </span>
              </Label>
            )}
            <div className="hidden sm:block sm:grow" />
            <div className="flex flex-row gap-3 self-end">
              <Button
                label="Decline"
                variant="outline"
                size="xs"
                icon={XClose}
                disabled={isValidating}
                isPulsing={isPulsing}
                onClick={() => void handleValidation("rejected")}
              />
              <Button
                label={toolOverride?.approveLabel ?? "Allow"}
                variant="highlight"
                size="xs"
                icon={Check}
                disabled={isValidating}
                isPulsing={isPulsing}
                onClick={() => void handleValidation("approved")}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="font-sm whitespace-normal wrap-break-word text-foreground">
          Waiting for{" "}
          <span className="font-semibold">{triggeringUser?.fullName}</span> to
          confirm.
        </div>
      )}
    </ContentMessage>
  );
}
