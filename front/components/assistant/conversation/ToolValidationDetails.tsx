import {
  AshbyJobPostingUpdateDetails,
  AshbyReferralDetails,
} from "@app/components/assistant/conversation/tool_validation/AshbyValidationDetails";
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
  POD_MANAGER_SERVER_NAME,
  UPDATE_MEMBERS_TOOL_NAME,
} from "@app/lib/api/actions/servers/pod_manager/metadata";
import { isPodManagerUpdateMembersInput } from "@app/lib/api/actions/servers/pod_manager/types";
import {
  CREATE_TASKS_TOOL_NAME,
  POD_TASKS_SERVER_NAME,
  UPDATE_TASKS_TOOL_NAME,
} from "@app/lib/api/actions/servers/pod_tasks/metadata";
import {
  isPodTasksCreateTasksInput,
  isPodTasksUpdateTasksInput,
} from "@app/lib/api/actions/servers/pod_tasks/types";
import { isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

const MAX_DISPLAY_VALUE_LENGTH = 300;

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
    return null;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (!isString(value)) {
    return null;
  }
  if (value.length <= MAX_DISPLAY_VALUE_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_DISPLAY_VALUE_LENGTH)}…`;
}

interface DisplayableInput {
  label: string;
  value: string;
}

interface ToolValidationDetailsProps {
  blockedAction: BlockedToolExecution;
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
        agentName={blockedAction.metadata.agentName}
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
        <div className="max-h-80 space-y-2 overflow-auto rounded-lg bg-muted p-3 text-sm dark:bg-muted-night">
          {displayableInputs.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-muted-foreground dark:text-muted-foreground-night">
                {label}
              </span>
              <span className="whitespace-pre-wrap break-words">{value}</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
