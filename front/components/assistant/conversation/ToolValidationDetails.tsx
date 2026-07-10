import {
  AshbyJobPostingUpdateDetails,
  AshbyReferralDetails,
} from "@app/components/assistant/conversation/tool_validation/AshbyValidationDetails";
import { PodEditInformationValidationDetails } from "@app/components/assistant/conversation/tool_validation/PodEditInformationValidationDetails";
import { PodMembersUpdateValidationDetails } from "@app/components/assistant/conversation/tool_validation/PodMembersUpdateValidationDetails";
import { PodTasksCreateValidationDetails } from "@app/components/assistant/conversation/tool_validation/PodTasksCreateValidationDetails";
import { PodTasksUpdateValidationDetails } from "@app/components/assistant/conversation/tool_validation/PodTasksUpdateValidationDetails";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import { ASHBY_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  CREATE_REFERRAL_TOOL_NAME,
  UPDATE_JOB_POSTING_TOOL_NAME,
} from "@app/lib/api/actions/servers/ashby/metadata";
import {
  isAshbyCreateReferralInput,
  isAshbyUpdateJobPostingInput,
} from "@app/lib/api/actions/servers/ashby/types";
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
import {
  SKILL_AUTHORING_SERVER_NAME,
  UPDATE_SKILL_TOOL_NAME,
} from "@app/lib/api/actions/servers/skill_authoring/metadata";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Markdown,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

function humanizeFieldName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^\w/, (char) => char.toUpperCase());
}

function formatDisplayValue(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "object") {
    // Render objects/arrays as formatted JSON, same as GenericActionDetails.
    // No truncation: the container is overflow-auto.
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (!isString(value)) {
    return null;
  }
  // Return the full string — no truncation, user needs the full payload to approve.
  return value;
}

interface DisplayableInput {
  label: string;
  value: string;
  // Whether `value` was produced from an object/array input (as opposed to a
  // string that merely looks like JSON), so it can be rendered as a
  // collapsible JSON code block.
  isJson: boolean;
}

interface ToolValidationDetailsProps {
  // Only the display fields are needed, so both agent-loop and sandbox-function blocked tool
  // executions can be rendered.
  blockedAction: Pick<BlockedToolExecution, "inputs" | "metadata">;
  user: UserType;
  owner: LightWorkspaceType;
  conversationId?: string | null;
  defaultExpanded?: boolean;
}

export function ToolValidationDetails({
  blockedAction,
  user,
  owner,
  conversationId,
  defaultExpanded = false,
}: ToolValidationDetailsProps) {
  // For skill_authoring `update_skill`, the only identifier the agent passes is
  // the skill `sId`, which is meaningless to a human approving the call. Resolve
  // it to the skill's name (or "Unknown skill" if the id is wrong / missing).
  const isSkillAuthoringUpdate =
    blockedAction.metadata.mcpServerName === SKILL_AUTHORING_SERVER_NAME &&
    blockedAction.metadata.toolName === UPDATE_SKILL_TOOL_NAME;

  const skillId =
    isSkillAuthoringUpdate && isString(blockedAction.inputs?.sId)
      ? blockedAction.inputs.sId
      : null;

  const { skill, isSkillLoading } = useSkill({
    workspaceId: owner.sId,
    skillId,
    disabled: !skillId,
  });

  const resolvedSkillName = isSkillLoading
    ? "Loading…"
    : (skill?.name ?? "Unknown skill");

  const displayableInputs: DisplayableInput[] = useMemo(() => {
    if (!blockedAction.inputs) {
      return [];
    }
    return Object.entries(blockedAction.inputs)
      .map(([key, value]) => {
        if (isSkillAuthoringUpdate && key === "sId") {
          return { label: "Skill", value: resolvedSkillName, isJson: false };
        }
        return {
          label: humanizeFieldName(key),
          value: formatDisplayValue(value),
          isJson: value !== null && typeof value === "object",
        };
      })
      .filter((entry): entry is DisplayableInput => entry.value !== null);
  }, [blockedAction.inputs, isSkillAuthoringUpdate, resolvedSkillName]);

  if (
    blockedAction.metadata.mcpServerName === ASHBY_SERVER_NAME &&
    blockedAction.metadata.toolName === CREATE_REFERRAL_TOOL_NAME &&
    isAshbyCreateReferralInput(blockedAction.inputs)
  ) {
    return (
      <AshbyReferralDetails
        fieldSubmissions={blockedAction.inputs.fieldSubmissions}
        userEmail={user.email}
      />
    );
  }

  if (
    blockedAction.metadata.mcpServerName === ASHBY_SERVER_NAME &&
    blockedAction.metadata.toolName === UPDATE_JOB_POSTING_TOOL_NAME &&
    isAshbyUpdateJobPostingInput(blockedAction.inputs)
  ) {
    return <AshbyJobPostingUpdateDetails {...blockedAction.inputs} />;
  }

  if (
    blockedAction.metadata.mcpServerName === POD_TASKS_SERVER_NAME &&
    blockedAction.metadata.toolName === CREATE_TASKS_TOOL_NAME &&
    isPodTasksCreateTasksInput(blockedAction.inputs)
  ) {
    return (
      <PodTasksCreateValidationDetails
        input={blockedAction.inputs}
        owner={owner}
        user={user}
        conversationId={conversationId}
      />
    );
  }

  if (
    blockedAction.metadata.mcpServerName === POD_TASKS_SERVER_NAME &&
    blockedAction.metadata.toolName === UPDATE_TASKS_TOOL_NAME &&
    isPodTasksUpdateTasksInput(blockedAction.inputs)
  ) {
    return (
      <PodTasksUpdateValidationDetails
        input={blockedAction.inputs}
        owner={owner}
        user={user}
        conversationId={conversationId}
      />
    );
  }

  if (
    blockedAction.metadata.mcpServerName === POD_MANAGER_SERVER_NAME &&
    blockedAction.metadata.toolName === EDIT_INFORMATION_TOOL_NAME &&
    isPodManagerEditInformationInput(blockedAction.inputs)
  ) {
    return (
      <PodEditInformationValidationDetails
        input={blockedAction.inputs}
        owner={owner}
        conversationId={conversationId}
      />
    );
  }

  if (
    blockedAction.metadata.mcpServerName === POD_MANAGER_SERVER_NAME &&
    blockedAction.metadata.toolName === UPDATE_MEMBERS_TOOL_NAME &&
    isPodManagerUpdateMembersInput(blockedAction.inputs)
  ) {
    return (
      <PodMembersUpdateValidationDetails
        input={blockedAction.inputs}
        owner={owner}
        user={user}
        conversationId={conversationId}
      />
    );
  }

  if (displayableInputs.length === 0) {
    return null;
  }

  return (
    <Collapsible defaultOpen={defaultExpanded}>
      <CollapsibleTrigger>
        <span className="my-2 font-medium">Details</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="max-h-80 space-y-2 overflow-auto rounded-lg bg-muted p-3 text-sm">
          {displayableInputs.map(({ label, value, isJson }) =>
            isJson ? (
              <Collapsible key={label}>
                <CollapsibleTrigger>
                  <span className="text-xs font-medium text-muted-foreground">
                    {label}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Markdown content={`\`\`\`json\n${value}\n\`\`\``} />
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {label}
                </span>
                <span className="whitespace-pre-wrap break-words">{value}</span>
              </div>
            )
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
