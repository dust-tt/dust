import type { AgentActionRunningEvents } from "@app/lib/actions/mcp";
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
