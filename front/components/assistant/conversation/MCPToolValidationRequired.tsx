import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { ToolValidationDetails } from "@app/components/assistant/conversation/ToolValidationDetails";
import { getIcon } from "@app/components/resources/resources_icons";
import { useValidateAction } from "@app/hooks/useValidateAction";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { extractArgRequiringApprovalValues } from "@app/lib/actions/tool_status";
import { useAuth } from "@app/lib/auth/AuthContext";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  Button,
  Checkbox,
  CheckIcon,
  ContentMessage,
  Label,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

type ToolOverride = {
  title?: (agentName: string, inputs: Record<string, unknown>) => string;
  alwaysAllowLabel?: (
    agentName: string,
    inputs: Record<string, unknown>
  ) => string;
  detailsExpanded?: boolean;
};

/** Overrides title, alwaysAllowLabel, and details expansion for specific MCP tools */
const MCP_TOOL_OVERRIDES: Partial<
  Record<string, Partial<Record<string, ToolOverride>>>
> = {
  "dust-chrome-extension": {
    interact_with_page: {
      title: (agentName, inputs) =>
        `Allow ${asDisplayName(agentName)} to ${inputs.humanReadableDescription}?`,
      alwaysAllowLabel: (agentName, inputs) =>
        "Allow all the interactions with this tab",
    },
  },
  "dust-firefox-extension": {
    interact_with_page: {
      title: (agentName, inputs) =>
        `Allow ${asDisplayName(agentName)} to ${inputs.humanReadableDescription}?`,
      alwaysAllowLabel: () => "Allow all the interactions with this tab",
    },
  },
  sandbox: {
    add_egress_domain: {
      detailsExpanded: true,
    },
  },
};

// Returns the queued blocked actions that should be auto-approved alongside
// `current` when the user grants always-allow. Low-stake persistence covers
// the tool across agents and arg values; medium-stake persistence is keyed
// on (agent, approval-relevant args), so the cascade is restricted to
// candidates that share both.
function findCascadableBlockedActions({
  current,
  candidates,
}: {
  current: BlockedToolExecution;
  candidates: BlockedToolExecution[];
}): BlockedToolExecution[] {
  return candidates.filter((candidate) => {
    if (candidate.actionId === current.actionId) {
      return false;
    }
    if (candidate.status !== "blocked_validation_required") {
      return false;
    }
    if (candidate.userId !== current.userId) {
      return false;
    }
    if (candidate.metadata.mcpServerName !== current.metadata.mcpServerName) {
      return false;
    }
    if (candidate.metadata.toolName !== current.metadata.toolName) {
      return false;
    }

    if (current.stake === "medium") {
      if (candidate.metadata.agentName !== current.metadata.agentName) {
        return false;
      }
      const currentArgs = extractArgRequiringApprovalValues(
        current.argumentsRequiringApproval ?? [],
        current.inputs
      );
      const candidateArgs = extractArgRequiringApprovalValues(
        candidate.argumentsRequiringApproval ?? [],
        candidate.inputs
      );
      if (!areArgRecordsEqual(currentArgs, candidateArgs)) {
        return false;
      }
    }

    return true;
  });
}

function areArgRecordsEqual(
  a: Record<string, string>,
  b: Record<string, string>
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => a[key] === b[key]);
}

interface MCPToolValidationRequiredProps {
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  blockedAction: BlockedToolExecution;
  conversationId: string;
  messageId: string;
}

export function MCPToolValidationRequired({
  triggeringUser,
  owner,
  blockedAction,
  conversationId,
  messageId,
}: MCPToolValidationRequiredProps) {
  const { user } = useAuth();
  const [neverAskAgain, setNeverAskAgain] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    getBlockedActions,
    removeCompletedAction,
    isActionPulsing,
    stopPulsingAction,
  } = useBlockedActionsContext();
  const { validateAction, isValidating } = useValidateAction({
    owner,
    conversationId,
    onError: setErrorMessage,
  });

  const isTriggeredByCurrentUser = useMemo(
    () => blockedAction.userId === user?.sId,
    [blockedAction.userId, user?.sId]
  );

  const isPulsing = isActionPulsing(blockedAction.actionId);

  const icon = blockedAction.metadata.icon
    ? getIcon(blockedAction.metadata.icon)
    : undefined;

  const handleValidation = async (approved: MCPValidationOutputType) => {
    // Stop pulsing immediately when the user takes an action.
    stopPulsingAction(blockedAction.actionId);

    setErrorMessage(null);

    const isAlwaysApproved = approved === "approved" && neverAskAgain;
    const finalApproval: MCPValidationOutputType = isAlwaysApproved
      ? "always_approved"
      : approved;

    const result = await validateAction({
      validationRequest: blockedAction,
      messageId,
      approved: finalApproval,
    });

    if (!result.success) {
      setErrorMessage("Failed to assess action approval. Please try again.");
      return;
    }

    // When the user grants always-allow, cascade to other queued
    // confirmations that the newly persisted preference would cover, so the
    // user does not have to click through every pending call of the same
    // tool individually. Capture matches before removing self from the
    // queue so the candidate list is stable.
    const cascadableActions =
      isAlwaysApproved && user
        ? findCascadableBlockedActions({
            current: blockedAction,
            candidates: getBlockedActions(user.sId),
          })
        : [];

    removeCompletedAction(blockedAction.actionId);
    setNeverAskAgain(false);

    if (cascadableActions.length > 0) {
      await concurrentExecutor(
        cascadableActions,
        async (matchingAction) => {
          const cascadeResult = await validateAction({
            validationRequest: matchingAction,
            messageId,
            approved: "approved",
          });
          if (cascadeResult.success) {
            removeCompletedAction(matchingAction.actionId);
          }
        },
        { concurrency: 4 }
      );
    }
  };

  const toolOverride =
    MCP_TOOL_OVERRIDES[blockedAction.metadata.mcpServerName]?.[
      blockedAction.metadata.toolName
    ];

  function getTitle() {
    if (!isTriggeredByCurrentUser) {
      return `Permission needed for ${asDisplayName(blockedAction.metadata.mcpServerName)}.`;
    }
    if (toolOverride?.title) {
      return toolOverride.title(
        blockedAction.metadata.agentName,
        blockedAction.inputs
      );
    }
    const subject =
      blockedAction.metadata.displayedAs === "agent"
        ? blockedAction.metadata.agentName
        : blockedAction.metadata.mcpServerName;
    return `Allow ${asDisplayName(subject)} to ${asDisplayName(blockedAction.metadata.toolName)}?`;
  }

  function getAlwaysAllowLabel() {
    if (blockedAction.stake !== "medium") {
      return "Always allow";
    }
    if (toolOverride?.alwaysAllowLabel) {
      return toolOverride.alwaysAllowLabel(
        blockedAction.metadata.agentName,
        blockedAction.inputs
      );
    }

    if (blockedAction.approvalArgsLabel) {
      return blockedAction.approvalArgsLabel;
    }
    const args = blockedAction.argumentsRequiringApproval ?? [];
    const argValues = args
      .filter((arg) => blockedAction.inputs[arg] != null)
      .map((arg) => {
        const value = blockedAction.inputs[arg];
        if (Array.isArray(value)) {
          return value.map(String).join(", ");
        }
        return JSON.stringify(value);
      });
    return `Always allow @${blockedAction.metadata.agentName} to ${asDisplayName(blockedAction.metadata.toolName)} ${
      argValues.length > 0
        ? ` for the following parameters: ${argValues.join(", ")}`
        : ""
    }`;
  }

  const title = getTitle();
  const alwaysAllowLabel = getAlwaysAllowLabel();

  return (
    <ContentMessage
      title={title}
      variant="primary"
      className="flex w-full flex-col gap-3 sm:w-80 sm:min-w-[500px]"
      icon={icon}
    >
      {isTriggeredByCurrentUser ? (
        <>
          <ToolValidationDetails
            blockedAction={blockedAction}
            user={user}
            defaultExpanded={toolOverride?.detailsExpanded}
          />
          {errorMessage && (
            <div className="mt-2 text-sm font-medium text-warning-800 dark:text-warning-800-night">
              {errorMessage}
            </div>
          )}
          <div className="flex flex-col gap-3 sm:mt-3">
            {(blockedAction.stake === "low" ||
              blockedAction.stake === "medium") && (
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
            <div className="hidden sm:block sm:flex-grow" />
            <div className="flex flex-row gap-3 self-end">
              <Button
                label="Decline"
                variant="outline"
                size="xs"
                icon={XMarkIcon}
                disabled={isValidating}
                isPulsing={isPulsing}
                onClick={() => void handleValidation("rejected")}
              />
              <Button
                label="Allow"
                variant="highlight"
                size="xs"
                icon={CheckIcon}
                disabled={isValidating}
                isPulsing={isPulsing}
                onClick={() => void handleValidation("approved")}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="font-sm whitespace-normal break-words text-foreground dark:text-foreground-night">
          Waiting for{" "}
          <span className="font-semibold">{triggeringUser?.fullName}</span> to
          confirm.
        </div>
      )}
    </ContentMessage>
  );
}
