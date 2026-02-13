import type { AgentActionRunningEvents } from "@app/lib/actions/mcp";
import type {
  ToolFileAuthRequiredEvent,
  ToolPersonalAuthRequiredEvent,
  ToolUserQuestionEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import type {
  AgentActionSuccessEvent,
  AgentContextPrunedEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageDoneEvent,
  AgentMessageSuccessEvent,
  ToolErrorEvent,
} from "@app/types/assistant/agent";
import type {
  AgentMessageNewEvent,
  ConversationTitleEvent,
  UserMessageNewEvent,
} from "@app/types/assistant/conversation";
import type { GenerationTokensEvent } from "@app/types/assistant/generation";

export type AgentMessageEvents =
  | AgentActionRunningEvents
  | AgentActionSuccessEvent
  | AgentContextPrunedEvent
  | AgentErrorEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
  | GenerationTokensEvent
  | ToolErrorEvent
  | ToolFileAuthRequiredEvent
  | ToolPersonalAuthRequiredEvent
  | ToolUserQuestionEvent;

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
