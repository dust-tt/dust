import type { AgentActionSpecificEvent } from "@app/lib/actions/types/agent";
import type {
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageNewEvent,
  AgentMessageSuccessEvent,
  GenerationTokensEvent,
  UserMessageNewEvent,
} from "@app/types";

export type AgentMessageAsyncEvents =
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | AgentErrorEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
  | GenerationTokensEvent;

export type ConversationAsyncEvents =
  | AgentMessageNewEvent
  | UserMessageNewEvent;
