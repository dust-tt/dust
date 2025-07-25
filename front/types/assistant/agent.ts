import type {
  ActionConfigurationType,
  AgentActionConfigurationType,
} from "@app/lib/actions/types/agent";
import type { AgentMessage } from "@app/lib/models/assistant/conversation";
import type {
  ReasoningContentType,
  TextContentType,
} from "@app/types/assistant/agent_message_content";
import type { FunctionCallContentType } from "@app/types/assistant/agent_message_content";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/assistant";
import type {
  AgentActionType,
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { TagType } from "@app/types/tag";
import type { UserType } from "@app/types/user";

/**
 * Agent configuration
 */

export type GlobalAgentStatus =
  | "active"
  | "disabled_by_admin"
  | "disabled_missing_datasource"
  | "disabled_free_workspace";

/**
 * Agent statuses:
 * - "active" means the agent can be used directly
 * - "archived" means the agent was either deleted, or that there is a newer
 *   version
 * - "draft" is used for the "try" button in builder, when the agent is not yet
 *   fully created / updated
 */
export type AgentStatus = "active" | "archived" | "draft";
export type AgentConfigurationStatus = AgentStatus | GlobalAgentStatus;

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
 * - {agentIds: string}: Retrieves specific agents by their sIds.
 * - 'all': All non-private agents (so combines workspace, published and global
 *   agents); used e.g. for non-user calls such as API
 * - 'published': Retrieves all published agents.
 * - 'global': Retrieves all agents exclusively with a 'global' scope.
 * - 'admin_internal': Grants access to all agents, including private ones.
 * - 'manage': Retrieves all agents for the manage agents view (same as list, but including disabled agents).
 * - 'archived': Retrieves all agents that are archived. Only available to super
 *   users. Intended strictly for internal use with necessary superuser or admin
 *   authorization.
 */
// TODO(agent-discovery) remove workspace, published, global
export type AgentsGetViewType =
  | { agentIds: string[]; allVersions?: boolean }
  | "current_user"
  | "list"
  | "all"
  | "published"
  | "global"
  | "admin_internal"
  | "manage"
  | "archived"
  | "favorites";

export type AgentUsageType = {
  messageCount: number;
  conversationCount: number;
  userCount: number;
  timePeriodSec: number;
};

export type AgentRecentAuthors = readonly string[];

export type AgentReasoningEffort = "none" | "light" | "medium" | "high";

export type AgentModelConfigurationType = {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  temperature: number;
  reasoningEffort?: AgentReasoningEffort;
  responseFormat?: string;
};

export type AgentFetchVariant = "light" | "full" | "extra_light";

export type LightAgentConfigurationType = {
  id: ModelId;

  versionCreatedAt: string | null;

  sId: string;
  version: number;
  // Global agents have a null authorId, others have a non-null authorId
  versionAuthorId: ModelId | null;

  instructions: string | null;

  model: AgentModelConfigurationType;

  status: AgentConfigurationStatus;
  scope: AgentConfigurationScope;

  // always false if not in the context of a user (API query)
  userFavorite: boolean;

  name: string;
  description: string;
  pictureUrl: string;

  // `lastAuthors` is expensive to compute, so we only compute it when needed.
  lastAuthors?: AgentRecentAuthors;
  editors?: UserType[];
  usage?: AgentUsageType;
  feedbacks?: { up: number; down: number };

  maxStepsPerRun: number;
  visualizationEnabled: boolean;
  tags: TagType[];

  templateId: string | null;

  // Group restrictions for accessing the agent/conversation.
  // The array of arrays represents permission requirements:
  // - If empty, no restrictions apply
  // - Each sub-array represents an OR condition (user must belong to AT LEAST ONE group)
  // - Sub-arrays are combined with AND logic (user must satisfy ALL sub-arrays)
  //
  // Example: [[1,2], [3,4]] means (1 OR 2) AND (3 OR 4)
  requestedGroupIds: string[][];

  canRead: boolean;
  canEdit: boolean;
};

export type AgentConfigurationType = LightAgentConfigurationType & {
  // If empty, no actions are performed, otherwise the actions are performed.
  actions: AgentActionConfigurationType[];
};

export interface TemplateAgentConfigurationType {
  name: string;
  pictureUrl: string;

  scope: AgentConfigurationScope;
  description: string;
  model: AgentModelConfigurationType;
  actions: AgentActionConfigurationType[];
  instructions: string | null;
  isTemplate: true;
  maxStepsPerRun?: number;
  visualizationEnabled: boolean;
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

export const DEFAULT_MAX_STEPS_USE_PER_RUN = 8;
export const MAX_STEPS_USE_PER_RUN_LIMIT = 128;
export const MAX_ACTIONS_PER_STEP = 16;

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
export type ErrorContent = {
  code: string;
  message: string;
  metadata: Record<string, string | number | boolean> | null;
};

// Generic event sent when an error occurred during the model call.
export type AgentErrorEvent = {
  type: "agent_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: ErrorContent;
};

// Event sent when an error occurred during the tool call.
export type ToolErrorEvent = {
  type: "tool_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: ErrorContent;
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
  action: AgentActionType;
};

// Event sent to stop the generation.
export type AgentGenerationCancelledEvent = {
  type: "agent_generation_cancelled";
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
    action: ActionConfigurationType;
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
  content: TextContentType | FunctionCallContentType | ReasoningContentType;
};
