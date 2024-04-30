/**
 * Agent execution.
 */

import { AgentMessageType } from "../../../../front/assistant/conversation";

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

// Event sent once the generation is completed.
export type AgentGenerationSuccessEvent = {
  type: "agent_generation_success";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
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
};
