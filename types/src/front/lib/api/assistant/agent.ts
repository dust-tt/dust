/**
 * Agent execution.
 */

import {
  AgentActionType,
  AgentMessageType,
} from "../../../../front/assistant/conversation";
import {
  DustAppRunBlockEvent,
  DustAppRunParamsEvent,
} from "../../../../front/lib/api/assistant/actions/dust_app_run";
import { RetrievalParamsEvent } from "../../../../front/lib/api/assistant/actions/retrieval";
import {
  TablesQueryModelOutputEvent,
  TablesQueryOutputEvent,
  TablesQueryStartedEvent,
} from "../../../../front/lib/api/assistant/actions/tables_query";
import {
  AgentActionConfigurationType,
  AgentActionSpecification,
} from "../../../assistant/agent";
import { BrowseParamsEvent } from "./actions/browse";
import { ProcessParamsEvent } from "./actions/process";
import { WebsearchParamsEvent } from "./actions/websearch";

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

// Event sent during the execution of an action. These are action specific.
export type AgentActionSpecificEvent =
  | RetrievalParamsEvent
  | DustAppRunParamsEvent
  | DustAppRunBlockEvent
  | TablesQueryStartedEvent
  | TablesQueryModelOutputEvent
  | TablesQueryOutputEvent
  | ProcessParamsEvent
  | WebsearchParamsEvent
  | BrowseParamsEvent;

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
    action: AgentActionConfigurationType;
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
