import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import type { AgentMessageConsumptionAnalyticsContext } from "@app/lib/resources/conversation_resource";
import type {
  RunResource,
  RunUsageWithRunKeyType,
} from "@app/lib/resources/run_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type {
  AgentMessageAnalyticsModel,
  AgentMessageConsumptionAnalyticsAgent,
  AgentMessageConsumptionAnalyticsUsageType,
  AgentMessageConsumptionAnalyticsUser,
} from "@app/types/assistant/analytics";
import type {
  AgentMessageStatus,
  UserMessageOrigin,
} from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";

export const CONSUMPTION_RECONCILIATION_SOURCE = {
  /** Derive input credits from the authoritative bill while preserving non-input credits. */
  Derived: "derived",
  /** Use the reconciled credit amounts stored on the consumption items. */
  Stored: "stored",
} as const;

export type ConsumptionReconciliationSource =
  (typeof CONSUMPTION_RECONCILIATION_SOURCE)[keyof typeof CONSUMPTION_RECONCILIATION_SOURCE];

export type BilledRunUsage = RunUsageWithRunKeyType & {
  usageType: AgentMessageConsumptionAnalyticsUsageType;
};

export type ConsumptionAnalyticsMessageMetadata = {
  agent: AgentMessageConsumptionAnalyticsAgent;
  agentMessageId: string;
  apiKeyName: string | null;
  completedAt: Date;
  contextOrigin: UserMessageOrigin | null;
  conversationId: string;
  messageStatus: AgentMessageStatus;
  messageVersion: number;
  model: AgentMessageAnalyticsModel | null;
  parentMessageId: string | null;
  spaceId: string | null;
  triggerId: string | null;
  user: AgentMessageConsumptionAnalyticsUser | null;
  workspaceId: string;
};

export type AgentMessageConsumptionAnalyticsInput =
  ConsumptionAnalyticsMessageMetadata & {
    actions: AgentMCPActionResource[];
    billedCredits: number;
    dustRunIds: string[];
    enabledSkillIdsByActionId: ReadonlyMap<string, string[]>;
    items: AgentMessageConsumptionItemResource[];
    runs: RunResource[];
    skills: SkillResource[];
    stepContents: AgentStepContentResource[];
    usages: BilledRunUsage[];
    reconciliationSource: ConsumptionReconciliationSource;
  };

export type ConsumptionAnalyticsSource = Pick<
  AgentMessageConsumptionAnalyticsInput,
  "billedCredits" | "items" | "reconciliationSource"
> & {
  completedAt: Date;
  context: AgentMessageConsumptionAnalyticsContext;
};

export type LoadSettledAttributionOptions = {
  agentMessageId: string;
  preloadedActions?: AgentMCPActionResource[];
  source?: "settled_attribution";
};

export type LoadConsumptionOptions = {
  agentMessageModelId: ModelId;
  preloadedActions?: AgentMCPActionResource[];
  source: "consumption";
};

export type LoadAgentMessageConsumptionAnalyticsInputOptions =
  | LoadSettledAttributionOptions
  | LoadConsumptionOptions;
