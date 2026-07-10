import { ToolValidationDetails } from "@app/components/assistant/conversation/ToolValidationDetails";
import { getIcon } from "@app/components/resources/resources_icons";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import {
  EDIT_INFORMATION_TOOL_NAME,
  POD_MANAGER_SERVER_NAME,
  UPDATE_MEMBERS_TOOL_NAME,
} from "@app/lib/api/actions/servers/pod_manager/metadata";
import {
  isPodManagerEditInformationInput,
  isPodManagerUpdateMembersInput,
} from "@app/lib/api/actions/servers/pod_manager/types";
import {
  CREATE_TASKS_TOOL_NAME,
  POD_TASKS_SERVER_NAME,
  UPDATE_TASKS_TOOL_NAME,
} from "@app/lib/api/actions/servers/pod_tasks/metadata";
import {
  isPodTasksCreateTasksInput,
  isPodTasksUpdateTasksInput,
} from "@app/lib/api/actions/servers/pod_tasks/types";
import { WAKEUPS_SERVER_NAME } from "@app/lib/api/actions/servers/wakeups/metadata";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { useAuth } from "@app/lib/auth/AuthContext";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
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

type ToolOverride = {
  title?: (inputs: Record<string, unknown>) => string;
  alwaysAllowLabel?: (inputs: Record<string, unknown>) => string;
  detailsExpanded?: boolean;
};

/** Overrides title, alwaysAllowLabel, and details expansion for specific MCP tools */
const MCP_TOOL_OVERRIDES: Partial<
  Record<string, Partial<Record<string, ToolOverride>>>
> = {
  "dust-chrome-extension": {
    interact_with_page: {
      title: (inputs) => `Allow agent to ${inputs.humanReadableDescription}?`,
      alwaysAllowLabel: () => "Allow all the interactions with this tab",
    },
  },
  "dust-firefox-extension": {
    interact_with_page: {
      title: (inputs) => `Allow agent to ${inputs.humanReadableDescription}?`,
      alwaysAllowLabel: () => "Allow all the interactions with this tab",
    },
  },
  sandbox: {
    add_egress_domain: {
      title: () => `Allow agent to add a domain to the Computer?`,
      detailsExpanded: true,
    },
  },
  [POD_TASKS_SERVER_NAME]: {
    [CREATE_TASKS_TOOL_NAME]: {
      title: (inputs) => {
        if (!isPodTasksCreateTasksInput(inputs)) {
          return `Allow agent to create tasks?`;
        }
        const count = inputs.tasks.length;
        return `Allow agent to create ${count} task${count === 1 ? "" : "s"}?`;
      },
      alwaysAllowLabel: () => `Always allow agent to create tasks`,
    },
    [UPDATE_TASKS_TOOL_NAME]: {
      title: (inputs) => {
        if (!isPodTasksUpdateTasksInput(inputs)) {
          return `Allow agent to update tasks?`;
        }
        const count = inputs.tasks.length;
        const doneCount = inputs.tasks.filter(
          (task) => task.doneRationale
        ).length;
        if (doneCount > 0 && doneCount === count) {
          return `Allow agent to mark ${count} task${count === 1 ? "" : "s"} as done?`;
        }
        if (doneCount > 0) {
          return `Allow agent to update ${count} task${count === 1 ? "" : "s"} (${doneCount} marked as done)?`;
        }
        return `Allow agent to update ${count} task${count === 1 ? "" : "s"}?`;
      },
      alwaysAllowLabel: () => `Always allow agent to update tasks`,
    },
  },
  [POD_MANAGER_SERVER_NAME]: {
    [EDIT_INFORMATION_TOOL_NAME]: {
      title: (inputs) => {
        if (!isPodManagerEditInformationInput(inputs)) {
          return `Allow agent to edit Pod information?`;
        }
        const fields: string[] = [];
        if (inputs.title !== undefined) {
          fields.push("title");
        }
        if (inputs.description !== undefined) {
          fields.push("description");
        }
        if (inputs.access !== undefined) {
          fields.push("access");
        }
        if (inputs.pinnedFramePath !== undefined) {
          fields.push("pinned frame");
        }
        if (fields.length === 0) {
          return `Allow agent to edit Pod information?`;
        }
        return `Allow agent to update Pod ${fields.join(", ")}?`;
      },
      alwaysAllowLabel: () => `Always allow agent to edit Pod information`,
    },
    [UPDATE_MEMBERS_TOOL_NAME]: {
      title: (inputs) => {
        if (!isPodManagerUpdateMembersInput(inputs)) {
          return `Allow agent to update Pod members?`;
        }
        const addCount = Object.keys(inputs.membersToAdd ?? {}).length;
        const removeCount = inputs.membersToRemove?.length ?? 0;
        const parts: string[] = [];
        if (addCount > 0) {
          parts.push(`add ${addCount}`);
        }
        if (removeCount > 0) {
          parts.push(`remove ${removeCount}`);
        }
        return `Allow agent to ${parts.join(" and ")} Pod user${addCount + removeCount === 1 ? "" : "s"}?`;
      },
      alwaysAllowLabel: () => `Always allow agent to update Pod members`,
    },
  },
  [WAKEUPS_SERVER_NAME]: {
    schedule_wakeup: {
      title: () => `Allow agent to schedule a wake-up?`,
    },
    list_wakeups: {
      title: () => `Allow agent to list wake-ups?`,
    },
    cancel_wakeup: {
      title: () => `Allow agent to cancel a wake-up?`,
    },
  },
};

// Display data needed to render a tool validation card, for both agent-loop and sandbox-function
// blocked tool executions.
export type ToolValidationRequest = Pick<
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
  owner,
  conversationId,
  errorMessage,
  isValidating,
  isPulsing = false,
  onValidate,
}: ToolValidationCardProps) {
  const { user } = useAuth();
  const [neverAskAgain, setNeverAskAgain] = useState(false);

  const canCurrentUserRespond = useMemo(
    () =>
      canCurrentUserRespondToParentUserMessage({
        parentUserId: validationRequest.userId,
        currentUserId: user?.sId,
      }),
    [validationRequest.userId, user?.sId]
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

  const toolOverride =
    MCP_TOOL_OVERRIDES[validationRequest.metadata.mcpServerName]?.[
      validationRequest.metadata.toolName
    ];

  function getTitle() {
    if (!canCurrentUserRespond) {
      return `Permission needed for ${asDisplayName(validationRequest.metadata.mcpServerName)}.`;
    }
    if (toolOverride?.title) {
      return toolOverride.title(validationRequest.inputs);
    }
    const subject =
      validationRequest.metadata.displayedAs === "agent"
        ? "agent"
        : validationRequest.metadata.mcpServerName;
    return `Allow ${asDisplayName(subject)} to ${asDisplayName(validationRequest.metadata.toolName)}?`;
  }

  function getAlwaysAllowLabel() {
    if (validationRequest.stake !== "medium") {
      return "Always allow";
    }
    if (toolOverride?.alwaysAllowLabel) {
      return toolOverride.alwaysAllowLabel(validationRequest.inputs);
    }

    if (validationRequest.approvalArgsLabel) {
      return validationRequest.approvalArgsLabel;
    }
    const args = validationRequest.argumentsRequiringApproval ?? [];
    const argValues = args
      .filter((arg) => validationRequest.inputs[arg] != null)
      .map((arg) => {
        const value = validationRequest.inputs[arg];
        if (Array.isArray(value)) {
          return value.map(String).join(", ");
        }
        return JSON.stringify(value);
      });
    return `Always allow agent to ${asDisplayName(validationRequest.metadata.toolName)} ${
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
      {canCurrentUserRespond ? (
        <>
          <ToolValidationDetails
            blockedAction={validationRequest}
            user={user}
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
            <div className="hidden sm:block sm:flex-grow" />
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
                label="Allow"
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
        <div className="font-sm whitespace-normal break-words text-foreground">
          Waiting for{" "}
          <span className="font-semibold">{triggeringUser?.fullName}</span> to
          confirm.
        </div>
      )}
    </ContentMessage>
  );
}
