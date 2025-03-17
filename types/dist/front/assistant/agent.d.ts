import { BrowseConfigurationType, BrowseParamsEvent } from "../../front/assistant/actions/browse";
import { ConversationIncludeFileConfigurationType, ConversationIncludeFileParamsEvent } from "../../front/assistant/actions/conversation/include_file";
import { DustAppRunBlockEvent, DustAppRunConfigurationType, DustAppRunParamsEvent } from "../../front/assistant/actions/dust_app_run";
import { ProcessConfigurationType, ProcessParamsEvent } from "../../front/assistant/actions/process";
import { RetrievalConfigurationType, RetrievalParamsEvent } from "../../front/assistant/actions/retrieval";
import { TablesQueryConfigurationType, TablesQueryModelOutputEvent, TablesQueryOutputEvent, TablesQueryStartedEvent } from "../../front/assistant/actions/tables_query";
import { WebsearchConfigurationType, WebsearchParamsEvent } from "../../front/assistant/actions/websearch";
import { AgentActionType, AgentMessageType } from "../../front/assistant/conversation";
import { ModelIdType, ModelProviderIdType } from "../../front/lib/assistant";
import { ModelId } from "../../shared/model_id";
import { ReasoningConfigurationType, ReasoningStartedEvent, ReasoningThinkingEvent, ReasoningTokensEvent } from "./actions/reasoning";
import { SearchLabelsConfigurationType, SearchLabelsParamsEvent } from "./actions/search_labels";
/**
 * Agent Action configuration
 */
export type AgentActionConfigurationType = BrowseConfigurationType | DustAppRunConfigurationType | ProcessConfigurationType | ReasoningConfigurationType | RetrievalConfigurationType | TablesQueryConfigurationType | WebsearchConfigurationType;
type ConversationAgentActionConfigurationType = ConversationIncludeFileConfigurationType;
type SearchLabelsAgentActionConfigurationType = SearchLabelsConfigurationType;
export type ActionConfigurationType = AgentActionConfigurationType | ConversationAgentActionConfigurationType | SearchLabelsAgentActionConfigurationType;
type UnsavedConfiguration<T> = Omit<T, "id" | "sId">;
export type UnsavedAgentActionConfigurationType = UnsavedConfiguration<TablesQueryConfigurationType> | UnsavedConfiguration<RetrievalConfigurationType> | UnsavedConfiguration<DustAppRunConfigurationType> | UnsavedConfiguration<ProcessConfigurationType> | UnsavedConfiguration<WebsearchConfigurationType> | UnsavedConfiguration<BrowseConfigurationType> | UnsavedConfiguration<ReasoningConfigurationType>;
export type AgentAction = AgentActionConfigurationType["type"] | ConversationAgentActionConfigurationType["type"];
export type AgentActionSpecification = {
    name: string;
    description: string;
    inputs: {
        name: string;
        description: string;
        type: "string" | "number" | "boolean" | "array";
        items?: {
            type: "string" | "number" | "boolean";
        };
    }[];
};
/**
 * Agent configuration
 */
export type GlobalAgentStatus = "active" | "disabled_by_admin" | "disabled_missing_datasource" | "disabled_free_workspace";
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
export declare const AGENT_CONFIGURATION_SCOPES: readonly ["global", "workspace", "published", "private"];
export type AgentConfigurationScope = (typeof AGENT_CONFIGURATION_SCOPES)[number];
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
export type AgentsGetViewType = {
    agentIds: string[];
    allVersions?: boolean;
} | "current_user" | "list" | "all" | "workspace" | "published" | "global" | "admin_internal" | "archived" | "favorites";
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
};
export type LightAgentConfigurationType = {
    id: ModelId;
    versionCreatedAt: string | null;
    sId: string;
    version: number;
    versionAuthorId: ModelId | null;
    instructions: string | null;
    model: AgentModelConfigurationType;
    status: AgentConfigurationStatus;
    scope: AgentConfigurationScope;
    userFavorite: boolean;
    name: string;
    description: string;
    pictureUrl: string;
    lastAuthors?: AgentRecentAuthors;
    usage?: AgentUsageType;
    feedbacks?: {
        up: number;
        down: number;
    };
    maxStepsPerRun: number;
    visualizationEnabled: boolean;
    templateId: string | null;
    requestedGroupIds: string[][];
    groupIds?: string[];
    reasoningEffort?: AgentReasoningEffort;
};
export type AgentConfigurationType = LightAgentConfigurationType & {
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
}
export declare const DEFAULT_MAX_STEPS_USE_PER_RUN = 8;
export declare const MAX_STEPS_USE_PER_RUN_LIMIT = 12;
/**
 * Agent events
 */
export type AgentMessageErrorEvent = {
    type: "agent_message_error";
    created: number;
    configurationId: string;
    error: {
        code: string;
        message: string;
    };
};
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
export type AgentActionSpecificEvent = BrowseParamsEvent | ConversationIncludeFileParamsEvent | DustAppRunBlockEvent | DustAppRunParamsEvent | ProcessParamsEvent | ReasoningStartedEvent | ReasoningThinkingEvent | ReasoningTokensEvent | RetrievalParamsEvent | SearchLabelsParamsEvent | TablesQueryModelOutputEvent | TablesQueryOutputEvent | TablesQueryStartedEvent | WebsearchParamsEvent;
export type AgentActionSuccessEvent = {
    type: "agent_action_success";
    created: number;
    configurationId: string;
    messageId: string;
    action: AgentActionType;
};
export type AgentGenerationCancelledEvent = {
    type: "agent_generation_cancelled";
    created: number;
    configurationId: string;
    messageId: string;
};
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
export {};
//# sourceMappingURL=agent.d.ts.map