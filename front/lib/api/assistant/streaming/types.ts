import type { AgentActionRunningEvents } from "@app/lib/actions/mcp";
import type {
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageDoneEvent,
  AgentMessageNewEvent,
  AgentMessageSuccessEvent,
  ConversationTitleEvent,
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

export type ConversationEvents =
  | ConversationTitleEvent
  | AgentMessageNewEvent
  | UserMessageNewEvent
  | AgentMessageDoneEvent;

export const TERMINAL_AGENT_MESSAGE_EVENT_TYPES: AgentMessageEvents["type"][] =
  [
    "agent_message_success",
    "agent_generation_cancelled",
    "agent_error",
    "tool_error",
  ] as const;
