import type { JSONSchema7 as JSONSchema } from "json-schema";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import type {
  MCPToolStakeLevelType,
  MCPValidationMetadataType,
} from "@app/lib/actions/constants";
import type { MCPServerAvailability } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolPersonalAuthRequiredEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { hideInternalConfiguration } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  DataSourceConfiguration,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import type { MCPToolRetryPolicyType } from "@app/lib/api/mcp";
import type { AdditionalConfigurationType } from "@app/lib/models/assistant/actions/mcp";
import type {
  DustAppRunConfigurationType,
  ModelId,
  PersonalAuthenticationRequiredErrorContent,
  ReasoningModelConfigurationType,
  TimeFrame,
  ToolErrorEvent,
} from "@app/types";
import {
  assertNever,
  isPersonalAuthenticationRequiredErrorContent,
} from "@app/types";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";

export type ActionApprovalStateType =
  | "approved"
  | "rejected"
  | "always_approved";

export type BaseMCPServerConfigurationType = {
  id: ModelId;

  sId: string;

  type: "mcp_server_configuration";

  name: string;

  description: string | null;
  icon?: CustomResourceIconType | InternalAllowedIconType;
};

// Server-side MCP server = Remote MCP Server OR our own MCP server.
export type ServerSideMCPServerConfigurationType =
  BaseMCPServerConfigurationType & {
    dataSources: DataSourceConfiguration[] | null;
    tables: TableDataSourceConfiguration[] | null;
    childAgentId: string | null;
    reasoningModel: ReasoningModelConfigurationType | null;
    timeFrame: TimeFrame | null;
    jsonSchema: JSONSchema | null;
    additionalConfiguration: AdditionalConfigurationType;
    mcpServerViewId: string;
    dustAppConfiguration: DustAppRunConfigurationType | null;
    secretName: string | null;
    // Out of convenience, we hold the sId of the internal server if it is an internal server.
    internalMCPServerId: string | null;
  };

export type ClientSideMCPServerConfigurationType =
  BaseMCPServerConfigurationType & {
    clientSideMcpServerId: string;
  };

export type MCPServerConfigurationType =
  | ServerSideMCPServerConfigurationType
  | ClientSideMCPServerConfigurationType;

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
};

type WithToolNameMetadata<T> = T & {
  originalName: string;
  mcpServerName: string;
};

export type ServerSideMCPToolConfigurationType =
  WithToolNameMetadata<ServerSideMCPToolType>;

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

export type LightServerSideMCPToolConfigurationType =
  LightMCPToolType<ServerSideMCPToolConfigurationType>;

export type LightClientSideMCPToolConfigurationType =
  LightMCPToolType<ClientSideMCPToolConfigurationType>;

export type LightMCPToolConfigurationType =
  | LightServerSideMCPToolConfigurationType
  | LightClientSideMCPToolConfigurationType;

export type ToolExecution = {
  conversationId: string;
  messageId: string;
  actionId: string;

  inputs: Record<string, unknown>;
  stake?: MCPToolStakeLevelType;

  metadata: MCPValidationMetadataType & {
    mcpServerId?: string;
    mcpServerDisplayName?: string;
  };
};

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
  );

// TODO(durable-agents): cleanup the types of the events.
export type MCPApproveExecutionEvent = ToolExecution & {
  type: "tool_approve_execution";
  created: number;
  configurationId: string;
  isLastBlockingEventForStep?: boolean;
};

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
): event is ToolErrorEvent & {
  error: PersonalAuthenticationRequiredErrorContent;
} {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    event.type === "tool_error" &&
    "error" in event &&
    isPersonalAuthenticationRequiredErrorContent(event.error)
  );
}

export function isBlockedActionEvent(
  event: unknown
): event is MCPApproveExecutionEvent | ToolPersonalAuthRequiredEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    (isMCPApproveExecutionEvent(event) ||
      isToolPersonalAuthRequiredEvent(event))
  );
}
