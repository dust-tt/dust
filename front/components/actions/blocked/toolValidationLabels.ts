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
import { WAKEUPS_SERVER_NAME } from "@app/lib/api/actions/servers/wakeups/metadata";
import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { formatList } from "@app/lib/i18n/format";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";

type Translate = (descriptor: MessageDescriptor) => string;

type ToolOverride = {
  title?: (inputs: Record<string, unknown>, t: Translate) => string;
  alwaysAllowLabel?: MessageDescriptor;
  detailsInline?: boolean;
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

/** Overrides validation labels and details placement for specific MCP tools. */
const MCP_TOOL_OVERRIDES: Partial<
  Record<string, Partial<Record<string, ToolOverride>>>
> = {
  "dust-chrome-extension": {
    interact_with_page: {
      title: (inputs, t) => {
        const description = String(inputs.humanReadableDescription);
        return t(msg`Allow agent to ${description}?`);
      },
      alwaysAllowLabel: msg`Allow all the interactions with this tab`,
    },
  },
  "dust-firefox-extension": {
    interact_with_page: {
      title: (inputs, t) => {
        const description = String(inputs.humanReadableDescription);
        return t(msg`Allow agent to ${description}?`);
      },
      alwaysAllowLabel: msg`Allow all the interactions with this tab`,
    },
  },
  sandbox: {
    add_egress_domain: {
      title: (_inputs, t) =>
        t(msg`Allow agent to add a domain to the Computer?`),
      detailsInline: true,
    },
  },
  [POD_TASKS_SERVER_NAME]: {
    [CREATE_TASKS_TOOL_NAME]: {
      title: (inputs, t) => {
        if (!isPodTasksCreateTasksInput(inputs)) {
          return t(msg`Allow agent to create tasks?`);
        }
        const count = inputs.tasks.length;
        return t(
          msg`${plural(count, {
            one: "Allow agent to create # task?",
            other: "Allow agent to create # tasks?",
          })}`
        );
      },
      alwaysAllowLabel: msg`Always allow agents to create tasks`,
    },
    [UPDATE_TASKS_TOOL_NAME]: {
      title: (inputs, t) => {
        if (!isPodTasksUpdateTasksInput(inputs)) {
          return t(msg`Allow agent to update tasks?`);
        }
        const count = inputs.tasks.length;
        const doneCount = inputs.tasks.filter(
          (task) => task.doneRationale
        ).length;
        if (doneCount > 0 && doneCount === count) {
          return t(
            msg`${plural(count, {
              one: "Allow agent to mark # task as done?",
              other: "Allow agent to mark # tasks as done?",
            })}`
          );
        }
        if (doneCount > 0) {
          return t(
            msg`${plural(count, {
              one: `Allow agent to update # task (${doneCount} marked as done)?`,
              other: `Allow agent to update # tasks (${doneCount} marked as done)?`,
            })}`
          );
        }
        return t(
          msg`${plural(count, {
            one: "Allow agent to update # task?",
            other: "Allow agent to update # tasks?",
          })}`
        );
      },
      alwaysAllowLabel: msg`Always allow agents to update tasks`,
    },
  },
  [POD_MANAGER_SERVER_NAME]: {
    [EDIT_INFORMATION_TOOL_NAME]: {
      title: (inputs, t) => {
        if (!isPodManagerEditInformationInput(inputs)) {
          return t(msg`Allow agent to edit Pod information?`);
        }
        const fields: string[] = [];
        if (inputs.title !== undefined) {
          fields.push(t(msg({ message: "title", context: "Pod field" })));
        }
        if (inputs.description !== undefined) {
          fields.push(t(msg({ message: "description", context: "Pod field" })));
        }
        if (inputs.access !== undefined) {
          fields.push(t(msg({ message: "access", context: "Pod field" })));
        }
        if (inputs.pinnedFramePath !== undefined) {
          fields.push(
            t(msg({ message: "pinned frame", context: "Pod field" }))
          );
        }
        if (fields.length === 0) {
          return t(msg`Allow agent to edit Pod information?`);
        }
        const fieldList = formatList(
          fields,
          { type: "conjunction" },
          getActiveLocale()
        );
        return t(msg`Allow agent to update Pod ${fieldList}?`);
      },
      alwaysAllowLabel: msg`Always allow agents to edit Pod information`,
    },
    [UPDATE_MEMBERS_TOOL_NAME]: {
      title: (inputs, t) => {
        if (!isPodManagerUpdateMembersInput(inputs)) {
          return t(msg`Allow agent to update Pod members?`);
        }
        const addCount = Object.keys(inputs.membersToAdd ?? {}).length;
        const removeCount = inputs.membersToRemove?.length ?? 0;
        if (addCount > 0 && removeCount > 0) {
          return t(
            msg`Allow agent to add ${plural(addCount, {
              one: "# Pod user",
              other: "# Pod users",
            })} and remove ${plural(removeCount, {
              one: "# Pod user",
              other: "# Pod users",
            })}?`
          );
        }
        if (addCount > 0) {
          return t(
            msg`${plural(addCount, {
              one: "Allow agent to add # Pod user?",
              other: "Allow agent to add # Pod users?",
            })}`
          );
        }
        if (removeCount > 0) {
          return t(
            msg`${plural(removeCount, {
              one: "Allow agent to remove # Pod user?",
              other: "Allow agent to remove # Pod users?",
            })}`
          );
        }
        return t(msg`Allow agent to update Pod members?`);
      },
      alwaysAllowLabel: msg`Always allow agents to update Pod members`,
    },
    [SET_DEFAULT_AGENT_TOOL_NAME]: {
      title: (inputs, t) => {
        if (!isPodManagerDefaultAgentInput(inputs)) {
          return t(msg`Allow agent to set the Pod default agent?`);
        }
        const { agentName } = inputs;
        if (agentName === null) {
          return t(msg`Allow agent to reset the Pod default agent to @dust?`);
        }
        return t(
          msg`Allow agent to set the Pod default agent to @${agentName}?`
        );
      },
      alwaysAllowLabel: msg`Always allow agents to set the Pod default agent`,
    },
  },
  [WAKEUPS_SERVER_NAME]: {
    schedule_wakeup: {
      title: (_inputs, t) => t(msg`Allow agent to schedule a wake-up?`),
    },
    list_wakeups: {
      title: (_inputs, t) => t(msg`Allow agent to list wake-ups?`),
    },
    cancel_wakeup: {
      title: (_inputs, t) => t(msg`Allow agent to cancel a wake-up?`),
    },
  },
};

export function getToolOverride(
  metadata: ToolValidationLabelData["metadata"]
): ToolOverride | undefined {
  return MCP_TOOL_OVERRIDES[metadata.mcpServerName]?.[metadata.toolName];
}

export function getToolValidationAlwaysAllowLabel(
  data: ToolValidationLabelData,
  t: Translate
): string {
  const toolName = asDisplayName(data.metadata.toolName);
  if (data.stake !== "medium") {
    return t(msg`Allow every time an agent uses the “${toolName}” tool`);
  }
  const toolOverride = getToolOverride(data.metadata);
  if (toolOverride?.alwaysAllowLabel) {
    return t(toolOverride.alwaysAllowLabel);
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
      const argName = asDisplayName(arg).toLowerCase();

      return {
        label: t(msg`“${argName}” is ${displayValue}`),
        value: displayValue,
      };
    });

  const [approvalScope] = approvalScopes;
  if (approvalScopes.length === 1 && approvalScope) {
    const { value } = approvalScope;
    return t(msg`Always allow agents to ${toolName} only for ${value}`);
  }
  if (approvalScopes.length > 1) {
    const conditions = formatList(
      approvalScopes.map(({ label }) => label),
      { type: "conjunction" },
      getActiveLocale()
    );
    return t(msg`Always allow agents to ${toolName} only when ${conditions}`);
  }

  return t(msg`Always allow agents to ${toolName}`);
}
