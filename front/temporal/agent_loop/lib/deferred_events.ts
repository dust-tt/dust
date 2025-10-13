import type { MCPApproveExecutionEvent } from "@app/lib/actions/mcp";
import type { ToolPersonalAuthRequiredEvent } from "@app/lib/actions/mcp_internal_actions/events";

/**
 * Union type of all events that can be deferred.
 * These are events that might need to be sent after all tools in a step complete,
 * rather than immediately when they occur.
 */
type DeferrableEvent = MCPApproveExecutionEvent | ToolPersonalAuthRequiredEvent;

/**
 * Context information needed to send a deferred event.
 * This captures the temporal workflow context at the time the event was deferred.
 */
type DeferredEventContext = {
  agentMessageId: string;
  agentMessageRowId: number;
  conversationId: string;
  step: number;
};

/**
 * A deferred event that will be sent later via publishDeferredEventsActivity.
 * Contains both the event data and the context needed to send it properly.
 */
export type DeferredEvent = {
  context: DeferredEventContext;
  event: DeferrableEvent;
  // Whether this event should pause the agent loop until external action is taken.
  shouldPauseAgentLoop: boolean;
};

/**
 * Result returned by runToolActivity indicating any events that should be deferred.
 */
export type ToolExecutionResult = {
  // Events that should be sent after all tools in the step complete.
  deferredEvents: DeferredEvent[];

  // Whether this event should pause the agent loop until external action is taken.
  shouldPauseAgentLoop?: boolean;
};
