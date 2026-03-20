import {
  CUSTOM_RESOURCE_ALLOWED,
  type CustomResourceIconType,
  INTERNAL_ALLOWED_ICONS,
  type InternalAllowedIconType,
} from "@app/components/resources/resources_icon_names";
import {
  MCP_TOOL_STAKE_LEVELS,
  type MCPToolStakeLevelType,
} from "@app/lib/actions/constants";
import type {
  LightMCPToolConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import {
  type InternalMCPServerNameType,
  MCP_SERVER_AVAILABILITY,
  type MCPServerAvailability,
} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  isLightClientSideMCPToolConfiguration,
  isLightServerSideMCPToolConfiguration,
  isServerSideMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import { OAUTH_PROVIDERS } from "@app/types/oauth/lib";
import { DbModelIdSchema } from "@app/types/shared/model_id";
import { EditedByUserSchema } from "@app/types/user";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

const MCP_OAUTH_USE_CASES = ["platform_actions", "personal_actions"] as const;

export const ToolDisplayLabelsSchema = z.object({
  running: z.string(),
  done: z.string(),
});

export type ToolDisplayLabels = z.infer<typeof ToolDisplayLabelsSchema>;

export const MCPToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.custom<JSONSchema>().optional(),
  displayLabels: ToolDisplayLabelsSchema.optional(),
});

export type MCPToolType = z.infer<typeof MCPToolSchema>;

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
  WithStakeLevelType<MCPToolWithAvailabilityType> & {
    argumentsRequiringApproval?: string[];
  };

const AuthorizationInfoSchema = z.object({
  provider: z.enum(OAUTH_PROVIDERS),
  supported_use_cases: z.array(z.enum(MCP_OAUTH_USE_CASES)),
  scope: z.string().optional(),
  workspace_connection: z
    .object({
      required: z.boolean(),
      satisfied: z.boolean(),
    })
    .optional(),
});

export const MCPServerSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  sId: z.string(),
  icon: z.enum([...CUSTOM_RESOURCE_ALLOWED, ...INTERNAL_ALLOWED_ICONS]),
  authorization: AuthorizationInfoSchema.nullable(),
  tools: z.array(MCPToolSchema),
  availability: z.enum(MCP_SERVER_AVAILABILITY),
  allowMultipleInstances: z.boolean(),
  documentationUrl: z.string().nullable(),
  developerSecretSelection: z
    .enum(["required", "optional"])
    .nullable()
    .optional(),
  developerSecretSelectionDescription: z.string().nullable().optional(),
  sharedSecret: z.string().nullable().optional(),
  customHeaders: z.record(z.string(), z.string()).nullable().optional(),
});

export type MCPServerType = z.infer<typeof MCPServerSchema>;

export type RemoteMCPServerType = MCPServerType & {
  url?: string;
  lastSyncAt?: Date | null;
  lastError?: string | null;
  icon: CustomResourceIconType | InternalAllowedIconType;
  // Always manual and allow multiple instances.
  availability: "manual";
  allowMultipleInstances: true;
};

const ToolsMetadataSchema = z.object({
  toolName: z.string(),
  permission: z.enum(MCP_TOOL_STAKE_LEVELS),
  enabled: z.boolean(),
});

export const MCPServerViewSchema = z.object({
  id: DbModelIdSchema,
  sId: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  spaceId: z.string(),
  serverType: z.enum(["remote", "internal"]),
  server: MCPServerSchema,
  oAuthUseCase: z.enum(MCP_OAUTH_USE_CASES).nullable(),
  editedByUser: EditedByUserSchema.nullable(),
  toolsMetadata: z.array(ToolsMetadataSchema).optional(),
});

export type MCPServerViewType = z.infer<typeof MCPServerViewSchema>;

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

export type DeveloperSecretSelectionType = "required" | "optional";
