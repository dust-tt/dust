import type {
  MCPToolStakeLevelType,
  MCPValidationMetadataType,
} from "@app/lib/actions/constants";
import type {
  InternalMCPServerNameType,
  InternalMCPToolNameType,
  MCPServerAvailability,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  MCPApproveExecutionEvent,
  ToolAskUserQuestionEvent,
  ToolExecution,
  ToolFileAuthRequiredEvent,
  ToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import { hideInternalConfiguration } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import type {
  FileAuthorizationInfo,
  UserQuestion,
} from "@app/lib/actions/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  MCPToolRetryPolicyType,
  ToolDisplayLabels,
} from "@app/lib/api/mcp";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { JSONSchema7 as JSONSchema } from "json-schema";

export type ActionApprovalStateType =
  | "approved"
  | "rejected"
  | "always_approved";

// Schemas are in mcp_schemas.ts to avoid pulling zod + heavy dependencies
// into the Temporal workflow sandbox (which doesn't have Buffer, etc.).
// Import schemas from "@app/lib/actions/mcp_schemas" directly.
import type {
  ClientSideMCPServerConfigurationType,
  ServerSideMCPServerConfigurationType,
} from "@app/lib/actions/mcp_schemas";

export type {
  BaseMCPServerConfigurationType,
  ClientSideMCPServerConfigurationType,
  MCPServerConfigurationType,
  ServerSideMCPServerConfigurationType,
} from "@app/lib/actions/mcp_schemas";

export type ServerSideMCPToolType = Omit<
  ServerSideMCPServerConfigurationType,
  "type"
> & {
  type: "mcp_configuration";
  inputSchema: JSONSchema;
  availability: MCPServerAvailability;
  permission: MCPToolStakeLevelType;
  toolServerId: string;
  timeoutMs?: number;
  retryPolicy: MCPToolRetryPolicyType;
  // For "medium" stake tools: defines which arguments require per-agent approval.
  // When present, the user must approve the specific (agent, tool, argument values) combination.
  argumentsRequiringApproval?: string[];
  displayLabels?: ToolDisplayLabels;
};

export type ClientSideMCPToolType = Omit<
  ClientSideMCPServerConfigurationType,
  "type"
> & {
  inputSchema: JSONSchema;
  permission: MCPToolStakeLevelType;
  toolServerId: string;
  type: "mcp_configuration";
  timeoutMs?: number;
  // For "medium" stake tools: defines which arguments require per-agent approval.
  // When present, the user must approve the specific (agent, tool, argument values) combination.
  argumentsRequiringApproval?: string[];
  displayLabels?: ToolDisplayLabels;
};

type WithToolNameMetadata<
  T,
  TOriginalName extends string = string,
  TMCPServerName extends string = string,
> = T & {
  originalName: TOriginalName;
  mcpServerName: TMCPServerName;
};

type InternalServerSideMCPToolType<N extends InternalMCPServerNameType> = Omit<
  ServerSideMCPToolType,
  "internalMCPServerId" | "name"
> & {
  internalMCPServerId: string;
  name: InternalMCPToolNameType<N>;
};

type ExternalServerSideMCPToolType = Omit<
  ServerSideMCPToolType,
  "internalMCPServerId"
> & {
  internalMCPServerId: null;
};

export type InternalServerSideMCPToolConfigurationType<
  N extends InternalMCPServerNameType = InternalMCPServerNameType,
> = WithToolNameMetadata<
  InternalServerSideMCPToolType<N>,
  InternalMCPToolNameType<N>
>;

export type ExternalServerSideMCPToolConfigurationType =
  WithToolNameMetadata<ExternalServerSideMCPToolType>;

export type ServerSideMCPToolConfigurationType<
  N extends InternalMCPServerNameType | null = InternalMCPServerNameType | null,
> = N extends InternalMCPServerNameType
  ? InternalServerSideMCPToolConfigurationType<N>
  : ExternalServerSideMCPToolConfigurationType;

export type ClientSideMCPToolConfigurationType =
  WithToolNameMetadata<ClientSideMCPToolType>;

export type MCPToolConfigurationType =
  | ServerSideMCPToolConfigurationType
  | ClientSideMCPToolConfigurationType;

export const MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT = [
  "description",
  "inputSchema",
] as const;

type LightMCPToolType<T> = Omit<
  T,
  (typeof MCP_TOOL_CONFIGURATION_FIELDS_TO_OMIT)[number]
>;

export type LightServerSideMCPToolConfigurationType<
  N extends InternalMCPServerNameType | null = InternalMCPServerNameType | null,
> = LightMCPToolType<ServerSideMCPToolConfigurationType<N>>;

export type LightClientSideMCPToolConfigurationType =
  LightMCPToolType<ClientSideMCPToolConfigurationType>;

export type LightMCPToolConfigurationType =
  | LightServerSideMCPToolConfigurationType
  | LightClientSideMCPToolConfigurationType;

export type { FileAuthorizationInfo };

export type BlockedToolExecution = ToolExecution &
  (
    | {
        status: "blocked_validation_required";
        authorizationInfo: AuthorizationInfo | null;
      }
    | {
        status: "blocked_child_action_input_required";
        authorizationInfo: AuthorizationInfo | null;
        resumeState: Record<string, unknown> | null;
        childBlockedActionsList: BlockedToolExecution[];
      }
    | {
        status: "blocked_authentication_required";
        metadata: MCPValidationMetadataType & {
          mcpServerId: string;
          mcpServerDisplayName: string;
        };
        authorizationInfo: AuthorizationInfo;
      }
    | {
        status: "blocked_file_authorization_required";
        metadata: MCPValidationMetadataType & {
          mcpServerId: string;
          mcpServerDisplayName: string;
        };
        fileAuthorizationInfo: FileAuthorizationInfo;
      }
    | {
        status: "blocked_user_answer_required";
        question: UserQuestion;
        authorizationInfo: null;
      }
  );

export function getMCPApprovalStateFromUserApprovalState(
  userApprovalState: ActionApprovalStateType
) {
  switch (userApprovalState) {
    case "always_approved":
    case "approved":
      return "ready_allowed_explicitly";

    case "rejected":
      return "denied";

    default:
      assertNever(userApprovalState);
  }
}

export type MCPParamsEvent = {
  type: "tool_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: AgentMCPActionWithOutputType;
  runIds?: string[];
};

export type MCPSuccessEvent = {
  type: "tool_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: AgentMCPActionWithOutputType;
};

export type MCPErrorEvent = {
  type: "tool_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
    metadata: Record<string, string | number | boolean> | null;
  };
};

export type ToolNotificationEvent = {
  type: "tool_notification";
  created: number;
  configurationId: string;
  conversationId: string;
  messageId: string;
  action: AgentMCPActionWithOutputType;
  notification: ProgressNotificationContentType;
};

export type AgentActionRunningEvents =
  | MCPParamsEvent
  | MCPApproveExecutionEvent
  | ToolNotificationEvent;

const MAX_DESCRIPTION_LENGTH = 1024;

/**
 * Builds a tool specification for the given MCP action configuration.
 */
export function buildToolSpecification(
  actionConfiguration: MCPToolConfigurationType
): AgentActionSpecification {
  // Filter out properties from the inputSchema that have a mimeType matching any value in INTERNAL_MIME_TYPES.TOOL_INPUT
  const filteredInputSchema = hideInternalConfiguration(
    actionConfiguration.inputSchema
  );

  return {
    name: actionConfiguration.name,
    description:
      actionConfiguration.description?.slice(0, MAX_DESCRIPTION_LENGTH) ?? "",
    inputSchema: filteredInputSchema,
  };
}

export function isMCPApproveExecutionEvent(
  event: unknown
): event is MCPApproveExecutionEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    event.type === "tool_approve_execution"
  );
}

function isToolPersonalAuthRequiredEvent(
  event: unknown
): event is ToolPersonalAuthRequiredEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    event.type === "tool_personal_auth_required"
  );
}

function isToolFileAuthRequiredEvent(
  event: unknown
): event is ToolFileAuthRequiredEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    event.type === "tool_file_auth_required"
  );
}

export function isToolAskUserQuestionEvent(
  event: unknown
): event is ToolAskUserQuestionEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    event.type === "tool_ask_user_question"
  );
}

export function isBlockedActionEvent(
  event: unknown
): event is
  | MCPApproveExecutionEvent
  | ToolAskUserQuestionEvent
  | ToolPersonalAuthRequiredEvent
  | ToolFileAuthRequiredEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    (isMCPApproveExecutionEvent(event) ||
      isToolPersonalAuthRequiredEvent(event) ||
      isToolFileAuthRequiredEvent(event) ||
      isToolAskUserQuestionEvent(event))
  );
}
