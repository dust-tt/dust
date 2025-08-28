import type { AgentActionRunningEvents } from "@app/lib/api/actions/error";
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
  | AgentActionRunningEvents
  | AgentActionSuccessEvent
  | AgentErrorEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
  | GenerationTokensEvent
  | ToolErrorEvent;

export type ConversationEvents = AgentMessageNewEvent | UserMessageNewEvent;
