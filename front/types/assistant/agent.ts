import type {
  ActionConfigurationType,
  AgentActionConfigurationType,
  AgentActionSpecification,
} from "@app/lib/actions/types/agent";
import type { TagType } from "@app/types/tag";

import type { ModelId } from "../shared/model_id";
import type { ModelIdType, ModelProviderIdType } from "./assistant";
import type { AgentActionType, AgentMessageType } from "./conversation";

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
 * - 'workspace' scope are editable by builders only,  inside-list by default but user can change it
 * - 'published' scope are editable by everybody, outside-list by default
 * - 'private' scope are editable by author only, inside-list for author, cannot be overriden (so no
 *   entry in the table
 */
export const AGENT_CONFIGURATION_SCOPES = [
  "global",
  "workspace",
  "published",
  "private",
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
 * - 'workspace': Retrieves all agents exclusively with a 'workspace' scope.
 * - 'published': Retrieves all agents exclusively with a 'published' scope.
 * - 'global': Retrieves all agents exclusively with a 'global' scope.
 * - 'admin_internal': Grants access to all agents, including private ones.
 * - 'archived': Retrieves all agents that are archived. Only available to super
 *   users. Intended strictly for internal use with necessary superuser or admin
 *   authorization.
 */
export type AgentsGetViewType =
  | { agentIds: string[]; allVersions?: boolean }
  | "current_user"
  | "list"
  | "all"
  | "workspace"
  | "published"
  | "global"
  | "admin_internal"
  | "archived"
  | "favorites";

export type AgentUsageType = {
  messageCount: number;
  conversationCount: number;
  userCount: number;
  timePeriodSec: number;
};

export type AgentRecentAuthors = readonly string[];

export type AgentReasoningEffort = "low" | "medium" | "high";

export type AgentModelConfigurationType = {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  temperature: number;
  reasoningEffort?: AgentReasoningEffort;
  responseFormat?: string;
};

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

  reasoningEffort?: AgentReasoningEffort;
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
export const MAX_STEPS_USE_PER_RUN_LIMIT = 12;

/**
 * Agent events
 */

// Event sent when an agent error occured before we have a agent message in the database.
export type AgentMessageErrorEvent = {
  type: "agent_message_error";
  created: number;
  configurationId: string;
  error: {
    code: string;
    message: string;
  };
};

// Generic event sent when an error occured (whether it's during the action or the message generation).
export type AgentErrorEvent = {
  type: "agent_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
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
    inputs: Record<string, string | boolean | number>;
    specification: AgentActionSpecification | null;
    functionCallId: string | null;
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

export type AgentContentEvent = {
  type: "agent_message_content";
  created: number;
  configurationId: string;
  messageId: string;
  content: string;
  processedContent: string;
};
