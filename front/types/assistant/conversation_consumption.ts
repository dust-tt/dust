import type {
  AgentMessageConsumptionModelDetails,
  AgentMessageConsumptionToolDetails,
} from "@app/types/assistant/agent_message_consumption";

/**
 * @swaggerschema PrivateConversationConsumptionToolDetails (swagger_private_schemas.ts)
 * @swaggerschema ConversationConsumptionToolDetails (swagger_schemas.ts)
 */
export type ConversationConsumptionToolDetails =
  AgentMessageConsumptionToolDetails;

/**
 * @swaggerschema PrivateConversationConsumptionModelDetails (swagger_private_schemas.ts)
 * @swaggerschema ConversationConsumptionModelDetails (swagger_schemas.ts)
 */
export type ConversationConsumptionModelDetails =
  AgentMessageConsumptionModelDetails;

/**
 * @swaggerschema PrivateConversationConsumptionAgentDetails (swagger_private_schemas.ts)
 * @swaggerschema ConversationConsumptionAgentDetails (swagger_schemas.ts)
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
 * @swaggerschema ConversationConsumptionDetails (swagger_schemas.ts)
 */
export type ConversationConsumptionDetails = {
  agentWorkCredits: number;
  tools: ConversationConsumptionToolDetails[];
  models: ConversationConsumptionModelDetails[];
  agents: ConversationConsumptionAgentDetails[];
};

/**
 * @swaggerschema ConversationConsumption (swagger_schemas.ts)
 */
export type ConversationConsumptionResponse = {
  billedCredits: number;
  details: ConversationConsumptionDetails | null;
};
