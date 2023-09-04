import { RetrievalConfigurationType } from "@app/types/assistant/actions/retrieval";

/**
 * Agent Action configuration
 */

export type AgentActionConfigurationType = RetrievalConfigurationType;

/**
 * Agent Message configuration
 */

export type AgentMessageConfigurationType = {
  prompt: string;
  model: {
    provider: string;
    modelId: string;
  };
};

/**
 * Agent configuration
 */

export type AgentConfigurationStatus = "active" | "archived";

export type AgentConfigurationType = {
  sId: string;
  status: AgentConfigurationStatus;

  name: string;
  pictureUrl: string | null;

  // If undefined, no action performed, otherwise the action is
  // performed (potentially NoOp eg autoSkip above).
  action: AgentActionConfigurationType | null;

  // If undefined, no text generation.
  message: AgentMessageConfigurationType | null;
};
