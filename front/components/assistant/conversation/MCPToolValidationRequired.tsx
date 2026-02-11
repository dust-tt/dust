import {
  Button,
  Checkbox,
  CheckIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
  Label,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { ToolValidationDetails } from "@app/components/assistant/conversation/ToolValidationDetails";
import { getIcon } from "@app/components/resources/resources_icons";
import { useValidateAction } from "@app/hooks/useValidateAction";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { useAuth } from "@app/lib/auth/AuthContext";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType, UserType } from "@app/types/user";

const MAX_DISPLAY_VALUE_LENGTH = 300;

function humanizeFieldName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function formatDisplayValue(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "object") {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  const str = String(value);
  if (!str) {
    return null;
  }
  if (str.length <= MAX_DISPLAY_VALUE_LENGTH) {
    return str;
  }
  return `${str.slice(0, MAX_DISPLAY_VALUE_LENGTH)}…`;
}

interface DisplayableInput {
  label: string;
  value: string;
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

  const { removeCompletedAction, isActionPulsing, stopPulsingAction } =
    useBlockedActionsContext();
  const { validateAction, isValidating } = useValidateAction({
    owner,
    conversationId,
    onError: setErrorMessage,
  });

  const isTriggeredByCurrentUser = useMemo(
    () => blockedAction.userId === user?.sId,
    [blockedAction.userId, user?.sId],
  );

  const isPulsing = isActionPulsing(blockedAction.actionId);

  const icon = blockedAction.metadata.icon
    ? getIcon(blockedAction.metadata.icon)
    : undefined;

  const displayableInputs: DisplayableInput[] = useMemo(() => {
    if (!blockedAction.inputs) {
      return [];
    }
    return Object.entries(blockedAction.inputs)
      .map(([key, value]) => ({
        label: humanizeFieldName(key),
        value: formatDisplayValue(value),
      }))
      .filter((entry): entry is DisplayableInput => entry.value !== null);
  }, [blockedAction.inputs]);

  const handleValidation = async (approved: MCPValidationOutputType) => {
    // Stop pulsing immediately when user takes action.
    stopPulsingAction(blockedAction.actionId);

    setErrorMessage(null);

    const result = await validateAction({
      validationRequest: blockedAction,
      messageId,
      approved:
        approved === "approved" && neverAskAgain ? "always_approved" : approved,
    });

    if (!result.success) {
      setErrorMessage("Failed to assess action approval. Please try again.");
      return;
    }
    removeCompletedAction(blockedAction.actionId);
    setNeverAskAgain(false);
  };

  const title = useMemo(() => {
    if (isTriggeredByCurrentUser) {
      return `Allow ${asDisplayName(blockedAction.metadata.mcpServerName)} to ${asDisplayName(blockedAction.metadata.toolName)}?`;
    } else {
      return `Permission needed for ${asDisplayName(blockedAction.metadata.mcpServerName)}.`;
    }
  }, [
    blockedAction.metadata.mcpServerName,
    blockedAction.metadata.toolName,
    isTriggeredByCurrentUser,
  ]);

  const alwaysAllowLabel = useMemo(() => {
    if (blockedAction.stake !== "medium") {
      return "Always allow";
    }

    const args = blockedAction.argumentsRequiringApproval ?? [];
    const argValues = args
      .filter((arg) => blockedAction.inputs[arg] != null)
      .map((arg) => `${blockedAction.inputs[arg]}`);

    return `Always allow @${blockedAction.metadata.agentName} to ${asDisplayName(blockedAction.metadata.toolName)} ${
      argValues.length > 0
        ? ` for the following parameters: ${argValues.join(", ")}`
        : ""
    }`;
  }, [
    blockedAction.stake,
    blockedAction.argumentsRequiringApproval,
    blockedAction.inputs,
    blockedAction.metadata.agentName,
    blockedAction.metadata.toolName,
  ]);

  return (
    <ContentMessage
      title={title}
      variant="primary"
      className="flex w-80 min-w-[300px] flex-col gap-3 sm:min-w-[500px]"
      icon={icon}
    >
      {isTriggeredByCurrentUser ? (
        <>
          {displayableInputs.length > 0 && (
            <ToolValidationDetails
              blockedAction={blockedAction}
              hasDetails={hasDetails}
              userEmail={user?.email ?? null}
            />
          )}
          {errorMessage && (
            <div className="mt-2 text-sm font-medium text-warning-800 dark:text-warning-800-night">
              {errorMessage}
            </div>
          )}
          <div className="mt-3 flex flex-row items-center gap-3">
            {(blockedAction.stake === "low" ||
              blockedAction.stake === "medium") && (
              <Label className="flex w-fit cursor-pointer flex-row items-center gap-2 py-1 pr-2 text-xs">
                <Checkbox
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
            <div className="flex-grow" />
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
