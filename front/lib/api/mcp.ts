import type { JSONSchema7 as JSONSchema } from "json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type {
  LightMCPToolConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import type {
  CustomServerIconType,
  InternalAllowedIconType,
} from "@app/lib/actions/mcp_icons";
import type {
  InternalMCPServerNameType,
  MCPServerAvailability,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata";
import {
  isLightClientSideMCPToolConfiguration,
  isLightServerSideMCPToolConfiguration,
  isServerSideMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import type { EditedByUser, MCPOAuthUseCase, ModelId } from "@app/types";

const MCP_TOOL_RETRY_POLICY_TYPES = ["retry_on_interrupt", "no_retry"] as const;
export type MCPToolRetryPolicyType =
  (typeof MCP_TOOL_RETRY_POLICY_TYPES)[number];

// Default to never_retryable if the retry policy is not defined.
export const DEFAULT_MCP_TOOL_RETRY_POLICY =
  "no_retry" as const satisfies MCPToolRetryPolicyType;

export function getRetryPolicyFromToolConfiguration(
  toolConfiguration: MCPToolConfigurationType | LightMCPToolConfigurationType
): MCPToolRetryPolicyType {
  return isLightServerSideMCPToolConfiguration(toolConfiguration) ||
    (!isLightClientSideMCPToolConfiguration(toolConfiguration) &&
      isServerSideMCPToolConfiguration(toolConfiguration))
    ? toolConfiguration.retryPolicy
    : // Client-side MCP tool retry policy is not supported yet.
      DEFAULT_MCP_TOOL_RETRY_POLICY;
}

export type MCPToolType = {
  name: string;
  description: string;
  inputSchema?: JSONSchema;
};

export type MCPToolWithAvailabilityType = MCPToolType & {
  availability: MCPServerAvailability;
};

export type WithStakeLevelType<T> = T & {
  stakeLevel: MCPToolStakeLevelType;
};

export type ServerSideMCPToolTypeWithStakeAndRetryPolicy =
  WithStakeLevelType<MCPToolWithAvailabilityType> & {
    toolServerId: string;
    timeoutMs?: number;
    retryPolicy: MCPToolRetryPolicyType;
  };

export type ClientSideMCPToolTypeWithStakeLevel =
  WithStakeLevelType<MCPToolWithAvailabilityType>;

export type MCPToolWithStakeLevelType =
  | ServerSideMCPToolTypeWithStakeAndRetryPolicy
  | ClientSideMCPToolTypeWithStakeLevel;

export type MCPServerType = {
  sId: string;
  name: string;
  version: string;
  description: string;
  icon: CustomServerIconType | InternalAllowedIconType;
  authorization: AuthorizationInfo | null;
  tools: MCPToolType[];
  availability: MCPServerAvailability;
  allowMultipleInstances: boolean;
  documentationUrl: string | null;
  requiresSecret?: boolean;
};

export type RemoteMCPServerType = MCPServerType & {
  url?: string;
  sharedSecret?: string | null;
  lastSyncAt?: Date | null;
  lastError?: string | null;
  customHeaders?: Record<string, string> | null;
  icon: CustomServerIconType | InternalAllowedIconType;
  // Always manual and allow multiple instances.
  availability: "manual";
  allowMultipleInstances: true;
};

export type MCPServerViewTypeType = "remote" | "internal";

export interface MCPServerViewType {
  id: ModelId;
  sId: string;
  name: string | null; // Can be null if the user did not set a custom name.
  description: string | null; // Can be null if the user did not set a custom description.
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  serverType: MCPServerViewTypeType;
  server: MCPServerType;
  oAuthUseCase: MCPOAuthUseCase | null;
  editedByUser: EditedByUser | null;
  toolsMetadata?: {
    toolName: string;
    permission: MCPToolStakeLevelType;
    enabled: boolean;
  }[];
}

export type MCPServerDefinitionType = Omit<
  MCPServerType,
  "tools" | "sId" | "availability" | "allowMultipleInstances"
>;

type InternalMCPServerType = MCPServerType & {
  name: InternalMCPServerNameType;
  // We enforce that we pass an icon here.
  icon: InternalAllowedIconType;
  // Instructions that are appended to the overall prompt.
  instructions: string | null;
};

export type InternalMCPServerDefinitionType = Omit<
  InternalMCPServerType,
  "tools" | "sId" | "availability" | "allowMultipleInstances"
>;

export type MCPServerTypeWithViews = MCPServerType & {
  views: MCPServerViewType[];
};
