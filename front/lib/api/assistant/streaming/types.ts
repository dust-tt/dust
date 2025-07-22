import type { AgentActionSpecificEvent } from "@app/lib/actions/types/agent";
import type {
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageNewEvent,
  AgentMessageSuccessEvent,
  GenerationTokensEvent,
  ToolErrorEvent,
  UserMessageNewEvent,
} from "@app/types";

export type AgentMessageEvents =
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | AgentErrorEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
  | GenerationTokensEvent
  | ToolErrorEvent;

export type ConversationEvents = AgentMessageNewEvent | UserMessageNewEvent;
