import type { ToolValidationProgress } from "@app/components/actions/blocked/ToolValidationCard";
import { ToolValidationCard as ToolValidationCardView } from "@app/components/actions/blocked/ToolValidationCard";
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

interface ToolValidationCardContainerProps {
  validationRequest: ToolValidationRequest;
  approvalProgress?: ToolValidationProgress;
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

export function ToolValidationCardContainer({
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
}: ToolValidationCardContainerProps) {
  const toolOverride = getToolOverride(validationRequest.metadata);

  const canCurrentUserRespond = canCurrentUserRespondToParentUserMessage({
    parentUserId: validationRequest.userId,
    currentUserId: currentUser.sId,
  });

  const icon = validationRequest.metadata.icon
    ? getIcon(validationRequest.metadata.icon)
    : undefined;

  const {
    metadata: { agentName, mcpServerName },
  } = validationRequest;

  const approvalTitle = `Allow ${agentName} to use ${asDisplayName(mcpServerName)}?`;
  const displayLabel =
    validationRequest.metadata.displayLabel ??
    asDisplayName(validationRequest.metadata.toolName);

  const canAlwaysAllow = ["low", "medium"].includes(
    validationRequest.stake ?? ""
  );
  const approveLabel = toolOverride?.approveLabel ?? "Allow";

  const details =
    canCurrentUserRespond &&
    Object.keys(validationRequest.inputs).length > 0 ? (
      <ToolValidationDetails
        blockedAction={validationRequest}
        user={currentUser}
        owner={owner}
        conversationId={conversationId}
      />
    ) : undefined;

  return (
    <ToolValidationCardView
      title={approvalTitle}
      description={displayLabel}
      icon={icon}
      approvalProgress={approvalProgress}
      canRespond={canCurrentUserRespond}
      triggeringUserName={triggeringUser?.fullName}
      details={details}
      detailsDefaultOpen={toolOverride?.detailsOpen}
      errorMessage={errorMessage}
      isValidating={isValidating}
      isPulsing={isPulsing}
      canAlwaysAllow={canAlwaysAllow}
      alwaysAllowTooltip={
        canAlwaysAllow
          ? getToolValidationAlwaysAllowLabel(validationRequest)
          : undefined
      }
      approveLabel={approveLabel}
      onValidate={onValidate}
    />
  );
}
