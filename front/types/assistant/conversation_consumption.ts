import type {
  AgentMessageConsumptionModelDetails,
  AgentMessageConsumptionToolDetails,
} from "@app/types/assistant/agent_message_consumption";

/**
 * @swaggerschema PrivateConversationConsumptionToolDetails (swagger_private_schemas.ts)
 */
export type ConversationConsumptionToolDetails =
  AgentMessageConsumptionToolDetails;

/**
 * @swaggerschema PrivateConversationConsumptionModelDetails (swagger_private_schemas.ts)
 */
export type ConversationConsumptionModelDetails =
  AgentMessageConsumptionModelDetails;

/**
 * @swaggerschema PrivateConversationConsumptionSkillDetails (swagger_private_schemas.ts)
 */
export type ConversationConsumptionSkillDetails = {
  skillId: string;
  name: string;
  icon: string | null;
  /** Full credits of the tool calls attributed to this skill. Skills can overlap. */
  attributedCredits: number;
};

/**
 * @swaggerschema PrivateConversationConsumptionAgentDetails (swagger_private_schemas.ts)
 */
export type ConversationConsumptionAgentDetails = {
  agentId: string;
  name: string;
  pictureUrl: string | null;
  billedCredits: number;
  agentWorkCredits: number;
  tools: ConversationConsumptionToolDetails[];
  models: ConversationConsumptionModelDetails[];
};

/**
 * @swaggerschema PrivateConversationConsumptionDetails (swagger_private_schemas.ts)
 */
export type ConversationConsumptionDetails = {
  agentWorkCredits: number;
  tools: ConversationConsumptionToolDetails[];
  /** Optional for compatibility with responses produced before skill attribution was exposed. */
  skills?: ConversationConsumptionSkillDetails[];
  models: ConversationConsumptionModelDetails[];
  agents: ConversationConsumptionAgentDetails[];
};

export type ConversationConsumptionResponse = {
  billedCredits: number;
  details: ConversationConsumptionDetails | null;
};
