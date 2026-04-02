import type {
  MCPServerConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import { MCPServerConfigurationSchema } from "@app/lib/actions/mcp_schemas";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type {
  AgentFunctionCallContentType,
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import type { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type { ModelIdType } from "@app/types/assistant/models/types";
import { DbModelIdSchema } from "@app/types/shared/model_id";
import { TagSchema, type TagType } from "@app/types/tag";
import { UserSchema } from "@app/types/user";
import { z } from "zod";

/**
 * Agent configuration
 */

export const GLOBAL_AGENT_STATUSES = [
  "active",
  "disabled_by_admin",
  "disabled_missing_datasource",
  "disabled_free_workspace",
] as const;
export type GlobalAgentStatus = (typeof GLOBAL_AGENT_STATUSES)[number];

/**
 * Agent statuses:
 * - "active" means the agent can be used directly
 * - "archived" means the agent was either deleted, or that there is a newer
 *   version
 * - "draft" is used for the "try" button in builder, when the agent is not yet
 *   fully created / updated
 * - "pending" is used when the agent builder is opened for a new agent, before
 *   it is saved for the first time (allows capturing sId early). It allows having
 *   a sId before creating the agent.
 */
export const AGENT_STATUSES = [
  "active",
  "archived",
  "draft",
  "pending",
] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const AGENT_CONFIGURATION_STATUSES = [
  "active",
  "archived",
  "draft",
  "pending",
  "disabled_by_admin",
  "disabled_missing_datasource",
  "disabled_free_workspace",
] as const;
export const AgentConfigurationStatusSchema = z.enum(
  AGENT_CONFIGURATION_STATUSES
);
export type AgentConfigurationStatus = z.infer<
  typeof AgentConfigurationStatusSchema
>;

/**
 * Agent configuration scope
 * - 'global' scope are Dust agents, not editable, inside-list for all, cannot be overriden
 * - 'visible' scope are published agents
 * - 'hidden' scope are unpuiblished agents, visible by editors only
 */
export const AGENT_CONFIGURATION_SCOPES = [
  "global",
  "visible",
  "hidden",
] as const;
export type AgentConfigurationScope =
  (typeof AGENT_CONFIGURATION_SCOPES)[number];

/**
 * Defines strategies for fetching agent configurations based on various
 * 'views':
 * - 'current_user': Retrieves agents created or edited by the current user.
 * - 'list': Retrieves all active agents accessible to the user
 * - 'all': All non-private agents (so combines workspace, published and global
 *   agents); used e.g. for non-user calls such as API
 * - 'published': Retrieves all published agents.
 * - 'global': Retrieves all agents exclusively with a 'global' scope.
 * - 'admin_internal': Grants access to all agents, including private ones.
 * - 'manage': Retrieves all agents for the manage agents view (same as list, but including disabled agents).
 * - 'archived': Retrieves all agents that are archived. Only available to super
 *   users. Intended strictly for internal use with necessary superuser or admin
 *   authorization.
 * - 'favorites': Retrieves all agents marked as favorites by the current user.
 */
// TODO(agent-discovery) remove workspace, published, global
export type AgentsGetViewType =
  | "current_user"
  | "list"
  | "all"
  | "published"
  | "global"
  | "admin_internal"
  | "manage"
  | "archived"
  | "favorites";

export type AgentRecentAuthors = readonly string[];

export const AGENT_REINFORCEMENT_MODES = ["auto", "on", "off"] as const;
export type AgentReinforcementMode = (typeof AGENT_REINFORCEMENT_MODES)[number];

const AGENT_REASONING_EFFORTS = ["none", "light", "medium", "high"] as const;

export const AgentReasoningEffortSchema = z.enum(AGENT_REASONING_EFFORTS);
export type AgentReasoningEffort = z.infer<typeof AgentReasoningEffortSchema>;

export const AgentUsageSchema = z.object({
  messageCount: z.number(),
  conversationCount: z.number(),
  userCount: z.number(),
  timePeriodSec: z.number(),
});

export type AgentUsageType = z.infer<typeof AgentUsageSchema>;

// Constrains a reasoning effort to the [min, max] range supported by a model.
export function clampReasoningEffort(
  effort: AgentReasoningEffort,
  min: AgentReasoningEffort,
  max: AgentReasoningEffort
): AgentReasoningEffort {
  const effortIndex = AGENT_REASONING_EFFORTS.indexOf(effort);
  const minIndex = AGENT_REASONING_EFFORTS.indexOf(min);
  const maxIndex = AGENT_REASONING_EFFORTS.indexOf(max);

  return AGENT_REASONING_EFFORTS[
    Math.max(minIndex, Math.min(maxIndex, effortIndex))
  ];
}

// ModelProviderIdSchema and ModelIdSchema are inlined here to avoid importing
// from models/models.ts and models/providers.ts which have io-ts side effects
// (ioTsEnum → uuid) that crash in the Temporal workflow sandbox.
export const AgentModelConfigurationSchema = z.object({
  providerId: z.custom<(typeof MODEL_PROVIDER_IDS)[number]>(
    (val) => typeof val === "string"
  ),
  modelId: z.custom<ModelIdType>((val) => typeof val === "string"),
  temperature: z.number(),
  reasoningEffort: AgentReasoningEffortSchema.optional(),
  responseFormat: z.string().optional(),
  metaData: z.record(z.string(), z.unknown()).optional(),
});

export type AgentModelConfigurationType = z.infer<
  typeof AgentModelConfigurationSchema
>;

export type AgentFetchVariant = "light" | "full" | "extra_light";

export type GlobalAgentContext = {
  userMessageRank: number;
  sidekickIsNewAgentFromScratch?: boolean;
  reinforcedAgentNotification?: {
    agentName: string;
    agentConfigurationId: string;
  };
};

export const LightAgentConfigurationSchema = z.object({
  id: DbModelIdSchema,
  versionCreatedAt: z.string().nullable(),
  sId: z.string(),
  version: z.number(),
  versionAuthorId: DbModelIdSchema.nullable(),
  instructions: z.string().nullable(),
  model: AgentModelConfigurationSchema,
  status: AgentConfigurationStatusSchema,
  scope: z.enum(AGENT_CONFIGURATION_SCOPES),
  userFavorite: z.boolean(),
  name: z.string(),
  description: z.string(),
  pictureUrl: z.string(),
  lastAuthors: z.array(z.string()).readonly().optional(),
  editors: z.array(UserSchema).optional(),
  usage: AgentUsageSchema.optional(),
  feedbacks: z.object({ up: z.number(), down: z.number() }).optional(),
  maxStepsPerRun: z.number(),
  tags: z.array(TagSchema),
  templateId: z.string().nullable(),
  visualizationEnabled: z.boolean().optional(),
  requestedGroupIds: z.array(z.array(z.string())),
  requestedSpaceIds: z.array(z.string()),
  reinforcement: z.enum(AGENT_REINFORCEMENT_MODES).optional(),
  canRead: z.boolean(),
  canEdit: z.boolean(),
  omittedThinking: z.boolean().optional(),
});

/**
 * @swaggerschema AgentConfiguration (swagger_schemas.ts), PrivateLightAgentConfiguration (swagger_private_schemas.ts)
 */
export type LightAgentConfigurationType = z.infer<
  typeof LightAgentConfigurationSchema
>;

export const AgentConfigurationSchema = LightAgentConfigurationSchema.extend({
  instructionsHtml: z.string().nullable(),
  actions: z.array(MCPServerConfigurationSchema),
  skills: z.array(z.string()).optional(),
});

export type AgentConfigurationType = z.infer<typeof AgentConfigurationSchema>;

export interface TemplateAgentConfigurationType {
  name: string;
  pictureUrl: string;

  scope: AgentConfigurationScope;
  description: string;
  model: AgentModelConfigurationType;
  actions: MCPServerConfigurationType[];
  instructions: string | null;
  isTemplate: true;
  maxStepsPerRun?: number;
  tags: TagType[];
}

export function isTemplateAgentConfiguration(
  agentConfiguration:
    | LightAgentConfigurationType
    | TemplateAgentConfigurationType
    | null
): agentConfiguration is TemplateAgentConfigurationType {
  return !!(
    agentConfiguration &&
    "isTemplate" in agentConfiguration &&
    agentConfiguration.isTemplate === true
  );
}

export const MAX_STEPS_USE_PER_RUN_LIMIT = 64;
const ACTIONS_PER_STEP_BY_DEPTH = [8, 8, 4, 2] as const;
const MAX_DEPTH_WITH_ACTION_LIMIT = ACTIONS_PER_STEP_BY_DEPTH.length - 1;

// Returns the max actions per step for a given conversation depth.
// Keeps max actions for the first 2 depth levels, then halves: 8 → 8 → 4 → 2,
// capping total concurrent agent loop activities at 512 for a single user message.
export function getMaxActionsPerStep(depth: number): number {
  const normalizedDepth = Number.isFinite(depth) ? Math.trunc(depth) : 0;
  const boundedDepth = Math.max(
    0,
    Math.min(normalizedDepth, MAX_DEPTH_WITH_ACTION_LIMIT)
  );

  return ACTIONS_PER_STEP_BY_DEPTH[boundedDepth];
}

/**
 * Agent events
 */

export const AgentErrorCategories = [
  "retryable_model_error",
  "context_window_exceeded",
  "provider_internal_error",
  "stream_error",
  "unknown_error",
  "invalid_response_format_configuration",
] as const;

export type AgentErrorCategory = (typeof AgentErrorCategories)[number];

export function isAgentErrorCategory(
  category: unknown
): category is AgentErrorCategory {
  return AgentErrorCategories.includes(category as AgentErrorCategory);
}

// Event sent when an agent error occurred before we have an agent message in the database.
export type AgentMessageErrorEvent = {
  type: "agent_message_error";
  created: number;
  configurationId: string;
  error: {
    code: string;
    message: string;
  };
};

// Generic type for the content of an agent / tool error.
export type GenericErrorContent = {
  code: string;
  message: string;
  metadata: Record<string, string | number | boolean> | null;
};

import type { PersonalAuthenticationRequiredErrorContent } from "@app/types/assistant/agent_error";

export type {
  MCPServerPersonalAuthenticationRequiredMetadata,
  PersonalAuthenticationRequiredErrorContent,
} from "@app/types/assistant/agent_error";
export { isPersonalAuthenticationRequiredErrorContent } from "@app/types/assistant/agent_error";

// Generic event sent when an error occurred during the model call.
export type AgentErrorEvent = {
  type: "agent_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: GenericErrorContent;
  runIds?: string[];
};

// Generic event sent when an agent message is done (could be successful, failed, or cancelled).
export type AgentMessageDoneEvent = {
  type: "agent_message_done";
  created: number;
  conversationId: string;
  configurationId: string;
  messageId: string;
  status: "success" | "error";
};

// Event sent when an error occurred during the tool call.
export type ToolErrorEvent = {
  type: "tool_error";
  created: number;
  configurationId: string;
  messageId: string;
  conversationId: string;
  error: GenericErrorContent | PersonalAuthenticationRequiredErrorContent;
  isLastBlockingEventForStep: boolean;
  // TODO(DURABLE-AGENTS 2025-08-25): Move to a deferred event base interface.
  metadata?: {
    pubsubMessageId?: string;
  };
};

export type AgentDisabledErrorEvent = {
  type: "agent_disabled_error";
  created: number;
  configurationId: string;
  error: {
    code: string;
    message: string;
  };
};

// Event sent once the action is completed, we're moving to generating a message if applicable.
export type AgentActionSuccessEvent = {
  type: "agent_action_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: AgentMCPActionWithOutputType;
};

// Event sent to stop the generation.
export type AgentGenerationCancelledEvent = {
  type: "agent_generation_cancelled";
  created: number;
  configurationId: string;
  messageId: string;
};

// Event sent when the agent loop was gracefully stopped (current step completed, then exited).
export type AgentMessageGracefullyStoppedEvent = {
  type: "agent_message_gracefully_stopped";
  created: number;
  configurationId: string;
  messageId: string;
};

// Event sent once the message is completed and successful.
export type AgentMessageSuccessEvent = {
  type: "agent_message_success";
  created: number;
  configurationId: string;
  messageId: string;
  message: AgentMessageType;
  runIds: string[];
};

export type AgentActionsEvent = {
  type: "agent_actions";
  created: number;
  runId: string;
  actions: Array<{
    action: MCPToolConfigurationType;
    functionCallId: string;
  }>;
};

export type AgentChainOfThoughtEvent = {
  type: "agent_chain_of_thought";
  created: number;
  configurationId: string;
  messageId: string;
  message: AgentMessageType;
  chainOfThought: string;
};

// Deprecated
// TODO(agent-step-content): Remove this event
export type AgentContentEvent = {
  type: "agent_message_content";
  created: number;
  configurationId: string;
  messageId: string;
  content: string;
  processedContent: string;
};

export type AgentStepContentEvent = {
  type: "agent_step_content";
  created: number;
  configurationId: string;
  messageId: string;
  index: number;
  content:
    | AgentTextContentType
    | AgentFunctionCallContentType
    | AgentReasoningContentType;
};

export type AgentContextPrunedEvent = {
  type: "agent_context_pruned";
  created: number;
  configurationId: string;
  messageId: string;
};
