import type { AgentActionRunningEvents } from "@app/lib/actions/mcp";
import type {
  AgentLoopToolAskUserQuestionEvent,
  AgentLoopToolFileAuthRequiredEvent,
  AgentLoopToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import type {
  AgentActionSuccessEvent,
  AgentContextPrunedEvent,
  AgentCreditAlertThresholdCrossedEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageConsumptionUpdatedEvent,
  AgentMessageDoneEvent,
  AgentMessageGracefullyStoppedEvent,
  AgentMessageSuccessEvent,
  AgentToolCallStartedEvent,
  ToolErrorEvent,
} from "@app/types/assistant/agent";
import type {
  AgentMessageNewEvent,
  CompactionMessageDoneEvent,
  CompactionMessageNewEvent,
  ConversationForkPreparedEvent,
  ConversationTitleEvent,
  PlanUpdatedEvent,
  UserMessageNewEvent,
  UserMessagePromotedEvent,
  WakeUpUpdatedEvent,
} from "@app/types/assistant/conversation";
import type { GenerationTokensEvent } from "@app/types/assistant/generation";

export type AgentMessageEvents =
  | AgentActionRunningEvents
  | AgentActionSuccessEvent
  | AgentContextPrunedEvent
  | AgentErrorEvent
  | AgentGenerationCancelledEvent
  | AgentMessageGracefullyStoppedEvent
  | AgentMessageSuccessEvent
  | AgentToolCallStartedEvent
  | AgentCreditAlertThresholdCrossedEvent
  | GenerationTokensEvent
  | ToolErrorEvent
  | AgentLoopToolAskUserQuestionEvent
  | AgentLoopToolFileAuthRequiredEvent
  | AgentLoopToolPersonalAuthRequiredEvent;

export type ConversationEvents =
  | ConversationTitleEvent
  | AgentMessageNewEvent
  | UserMessageNewEvent
  | UserMessagePromotedEvent
  | AgentMessageConsumptionUpdatedEvent
  | AgentMessageDoneEvent
  | CompactionMessageNewEvent
  | CompactionMessageDoneEvent
  | ConversationForkPreparedEvent
  | PlanUpdatedEvent
  | WakeUpUpdatedEvent;

export const TERMINAL_AGENT_MESSAGE_EVENT_TYPES: AgentMessageEvents["type"][] =
  [
    "agent_message_success",
    "agent_message_gracefully_stopped",
    "agent_generation_cancelled",
    "agent_error",
    "tool_error",
  ] as const;
