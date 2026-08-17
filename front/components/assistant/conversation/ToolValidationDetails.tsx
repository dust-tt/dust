import {
  AshbyJobPostingUpdateDetails,
  AshbyReferralDetails,
} from "@app/components/assistant/conversation/tool_validation/AshbyValidationDetails";
import { PodEditInformationValidationDetails } from "@app/components/assistant/conversation/tool_validation/PodEditInformationValidationDetails";
import { PodMembersUpdateValidationDetails } from "@app/components/assistant/conversation/tool_validation/PodMembersUpdateValidationDetails";
import { PodTasksCreateValidationDetails } from "@app/components/assistant/conversation/tool_validation/PodTasksCreateValidationDetails";
import { PodTasksUpdateValidationDetails } from "@app/components/assistant/conversation/tool_validation/PodTasksUpdateValidationDetails";
import { SandboxFunctionPublishValidationDetails } from "@app/components/assistant/conversation/tool_validation/SandboxFunctionPublishValidationDetails";
import { SandboxFunctionUnpublishValidationDetails } from "@app/components/assistant/conversation/tool_validation/SandboxFunctionUnpublishValidationDetails";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import {
  ASHBY_SERVER_NAME,
  validateToolInputs,
} from "@app/lib/actions/mcp_internal_actions/constants";
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
import { SANDBOX_FUNCTIONS_SERVER_NAME } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import {
  SKILL_AUTHORING_SERVER_NAME,
  UPDATE_SKILL_TOOL_NAME,
} from "@app/lib/api/actions/servers/skill_authoring/metadata";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { isNumber, isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { Markdown } from "@dust-tt/sparkle";

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
  if (isNumber(value)) {
    return String(value);
  }
  if (!isString(value)) {
    return null;
  }
  // Return the full string — no truncation, user needs the full payload to approve.
  return value;
}

interface DisplayableInput {
  key: string;
  label: string;
  value: string;
  // Whether `value` was produced from an object/array input rather than a
  // string that merely looks like JSON.
  isJson: boolean;
}

interface ToolValidationDetailsProps {
  // Only the display fields are needed, so both agent-loop and sandbox-function blocked tool
  // executions can be rendered.
  blockedAction: Pick<BlockedToolExecution, "inputs" | "metadata">;
  user: UserType;
  owner: LightWorkspaceType;
  conversationId?: string | null;
}

export function ToolValidationDetails({
  blockedAction,
  user,
  owner,
  conversationId,
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

  const displayableInputs: DisplayableInput[] = Object.entries(
    blockedAction.inputs
  ).flatMap(([key, value]) => {
    if (isSkillAuthoringUpdate && key === "sId") {
      return [{ key, label: "Skill", value: resolvedSkillName, isJson: false }];
    }

    const displayValue = formatDisplayValue(value);
    if (displayValue === null) {
      return [];
    }

    return [
      {
        key,
        label: humanizeFieldName(key),
        value: displayValue,
        isJson: value !== null && typeof value === "object",
      },
    ];
  });

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

  if (
    blockedAction.metadata.mcpServerName === SANDBOX_FUNCTIONS_SERVER_NAME &&
    blockedAction.metadata.toolName === "publish" &&
    validateToolInputs(
      SANDBOX_FUNCTIONS_SERVER_NAME,
      "publish",
      blockedAction.inputs
    )
  ) {
    return (
      <SandboxFunctionPublishValidationDetails input={blockedAction.inputs} />
    );
  }

  if (
    blockedAction.metadata.mcpServerName === SANDBOX_FUNCTIONS_SERVER_NAME &&
    blockedAction.metadata.toolName === "unpublish" &&
    validateToolInputs(
      SANDBOX_FUNCTIONS_SERVER_NAME,
      "unpublish",
      blockedAction.inputs
    )
  ) {
    return (
      <SandboxFunctionUnpublishValidationDetails input={blockedAction.inputs} />
    );
  }

  if (displayableInputs.length === 0) {
    return null;
  }

  return (
    <dl className="divide-y divide-separator">
      {displayableInputs.map(({ key, label, value, isJson }) => (
        <div
          key={key}
          className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-4"
        >
          <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
          <dd className="min-w-0 text-sm text-foreground">
            {isJson ? (
              <div className="max-w-full overflow-auto">
                <Markdown content={`\`\`\`json\n${value}\n\`\`\``} />
              </div>
            ) : (
              <span className="whitespace-pre-wrap wrap-break-word">
                {value}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
