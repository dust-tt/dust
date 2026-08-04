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
  attributionVersion: number;
  agentWorkCredits: number;
  tools: ConversationConsumptionToolDetails[];
  models: ConversationConsumptionModelDetails[];
  agents: ConversationConsumptionAgentDetails[];
};

export type ConversationConsumptionResponse = {
  billedCredits: number;
  details: ConversationConsumptionDetails | null;
};
