import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import {
  EDIT_INFORMATION_TOOL_NAME,
  POD_MANAGER_SERVER_NAME,
  SET_DEFAULT_AGENT_TOOL_NAME,
  UPDATE_MEMBERS_TOOL_NAME,
} from "@app/lib/api/actions/servers/pod_manager/metadata";
import {
  isPodManagerDefaultAgentInput,
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
import { SANDBOX_FUNCTIONS_SERVER_NAME } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import { WAKEUPS_SERVER_NAME } from "@app/lib/api/actions/servers/wakeups/metadata";
import { asDisplayName } from "@app/types/shared/utils/string_utils";

type ToolOverride = {
  title?: (inputs: Record<string, unknown>) => string;
  approveLabel?: string;
  alwaysAllowLabel?: (inputs: Record<string, unknown>) => string;
  detailsOpen?: boolean;
};

// Display data needed to compute the title and always-allow label of a tool validation card, for
// both agent-loop and sandbox-function blocked tool executions.
export type ToolValidationLabelData = Pick<
  BlockedToolExecution,
  | "stake"
  | "inputs"
  | "metadata"
  | "approvalArgsLabel"
  | "argumentsRequiringApproval"
>;

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
      detailsOpen: true,
    },
  },
  [SANDBOX_FUNCTIONS_SERVER_NAME]: {
    publish: {
      title: () => "Publish this function?",
      approveLabel: "Publish",
      alwaysAllowLabel: () => "Always allow agent to publish Pod functions",
    },
    unpublish: {
      title: () => "Unpublish this function?",
      approveLabel: "Unpublish",
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
    [SET_DEFAULT_AGENT_TOOL_NAME]: {
      title: (inputs) => {
        if (!isPodManagerDefaultAgentInput(inputs)) {
          return `Allow agent to set the Pod default agent?`;
        }
        if (inputs.agentName === null) {
          return `Allow agent to reset the Pod default agent to @dust?`;
        }
        return `Allow agent to set the Pod default agent to @${inputs.agentName}?`;
      },
      alwaysAllowLabel: () => "Always allow agent to set the Pod default agent",
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

export function getToolOverride(
  metadata: ToolValidationLabelData["metadata"]
): ToolOverride | undefined {
  return MCP_TOOL_OVERRIDES[metadata.mcpServerName]?.[metadata.toolName];
}

export function getToolValidationTitle(
  data: ToolValidationLabelData,
  canCurrentUserRespond: boolean
): string {
  if (!canCurrentUserRespond) {
    return `Permission needed for ${asDisplayName(data.metadata.mcpServerName)}.`;
  }
  const toolOverride = getToolOverride(data.metadata);
  if (toolOverride?.title) {
    return toolOverride.title(data.inputs);
  }
  const subject =
    data.metadata.displayedAs === "agent"
      ? "agent"
      : data.metadata.mcpServerName;
  return `Allow ${asDisplayName(subject)} to ${asDisplayName(data.metadata.toolName)}?`;
}

export function getToolValidationAlwaysAllowLabel(
  data: ToolValidationLabelData
): string {
  if (data.stake !== "medium") {
    return "Always allow";
  }
  const toolOverride = getToolOverride(data.metadata);
  if (toolOverride?.alwaysAllowLabel) {
    return toolOverride.alwaysAllowLabel(data.inputs);
  }

  if (data.approvalArgsLabel) {
    return data.approvalArgsLabel;
  }
  const args = data.argumentsRequiringApproval ?? [];
  const approvalScopes = args
    .filter((arg) => data.inputs[arg] != null)
    .map((arg) => {
      const value = data.inputs[arg];
      const displayValue = Array.isArray(value)
        ? value.map(String).join(", ")
        : typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value);

      return `${asDisplayName(arg)} is ${displayValue}`;
    });
  return `Always allow ${data.metadata.agentName} to ${asDisplayName(data.metadata.toolName)}${
    approvalScopes.length > 0
      ? ` only when ${approvalScopes.join(" and ")}`
      : ""
  }`;
}
