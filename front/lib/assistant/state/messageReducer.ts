import type {
  MCPActionType,
  ToolNotificationEvent,
} from "@app/lib/actions/mcp";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { getLightAgentMessageFromAgentMessage } from "@app/lib/api/assistant/citations";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { ModelId } from "@app/types";
import { assertNever } from "@app/types";
import type { LightAgentMessageType } from "@app/types/assistant/conversation";

export type AgentStateClassification =
  | "thinking"
  | "acting"
  | "writing"
  | "done";

export type ActionProgressState = Map<
  ModelId,
  {
    action: MCPActionType;
    progress?: ProgressNotificationContentType;
  }
>;

export type StreamingBlock = 
  | { type: "thinking"; content: string; isStreaming: boolean }
  | { type: "action"; action: MCPActionType; status: "created" | "succeeded" | "failed" | "cancelled" };

export interface MessageTemporaryState {
  message: LightAgentMessageType;
  agentState: AgentStateClassification;
  isRetrying: boolean;
  lastUpdated: Date;
  actionProgress: ActionProgressState;
  streamingBlocks: StreamingBlock[];
  currentStreamingContent: string | null;
  currentStreamingType: "thinking" | "content" | null;
}

export type AgentMessageStateEvent = AgentMessageEvents | ToolNotificationEvent;

type AgentMessageStateEventWithoutToolApproveExecution = Exclude<
  AgentMessageStateEvent,
  { type: "tool_approve_execution" }
>;

function updateMessageWithAction(
  m: LightAgentMessageType,
  action: MCPActionType
): LightAgentMessageType {
  return {
    ...m,
    chainOfThought: "",
    actions: [...m.actions.filter((a) => a.id !== action.id), action],
  };
}

function finalizeCurrentStreamingBlock(state: MessageTemporaryState): StreamingBlock[] {
  const blocks = [...state.streamingBlocks];
  
  // If we have current streaming content, finalize it
  if (state.currentStreamingContent && state.currentStreamingContent.trim() && state.currentStreamingType === "thinking") {
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock && lastBlock.type === "thinking" && lastBlock.isStreaming) {
      // Update the last thinking block to be finalized
      blocks[blocks.length - 1] = {
        ...lastBlock,
        content: state.currentStreamingContent,
        isStreaming: false
      };
    } else {
      // Add a new completed thinking block if somehow we don't have one streaming
      blocks.push({
        type: "thinking",
        content: state.currentStreamingContent,
        isStreaming: false
      });
    }
  }
  
  return blocks;
}

function updateProgress(
  state: MessageTemporaryState,
  event: ToolNotificationEvent
): MessageTemporaryState {
  const actionId = event.action.id;
  const currentProgress = state.actionProgress.get(actionId);

  const newState = {
    ...state,
    actionProgress: new Map(state.actionProgress).set(actionId, {
      action: event.action,
      progress: {
        ...currentProgress?.progress,
        ...event.notification,
        data: {
          ...currentProgress?.progress?.data,
          ...event.notification.data,
        },
      },
    }),
  };

  return newState;
}

export const CLEAR_CONTENT_EVENT = { type: "clear_content" as const };

export type ClearContentEvent = typeof CLEAR_CONTENT_EVENT;

export function messageReducer(
  state: MessageTemporaryState,
  event: AgentMessageStateEventWithoutToolApproveExecution | ClearContentEvent
): MessageTemporaryState {
  switch (event.type) {
    case "clear_content":
      // Only clear if we don't have any blocks yet (fresh start)
      // Otherwise preserve the history
      const shouldClearBlocks = state.streamingBlocks.length === 0;
      return {
        ...state,
        message: {
          ...state.message,
          content: null,
          chainOfThought: null,
        },
        streamingBlocks: shouldClearBlocks ? [] : state.streamingBlocks,
        currentStreamingContent: null,
        currentStreamingType: null,
      };
    case "agent_action_success":
      // Update the action block in streamingBlocks
      const updatedBlocks = state.streamingBlocks.map(block => 
        block.type === "action" && block.action.id === event.action.id
          ? { ...block, action: event.action, status: "succeeded" as const }
          : block
      );
      return {
        ...state,
        message: updateMessageWithAction(state.message, event.action),
        // Clean up progress for this specific action.
        actionProgress: new Map(
          Array.from(state.actionProgress.entries()).filter(
            ([id]) => id !== event.action.id
          )
        ),
        streamingBlocks: updatedBlocks,
      };

    case "tool_notification": {
      return updateProgress(state, event);
    }

    case "tool_error":
    case "agent_error":
      // Mark the last action block as failed if it exists
      const errorBlocks = state.streamingBlocks.map((block, idx) => {
        if (idx === state.streamingBlocks.length - 1 && block.type === "action") {
          return { ...block, status: "failed" as const };
        }
        return block;
      });
      return {
        ...state,
        message: {
          ...state.message,
          status: "failed",
          error: event.error,
        },
        agentState: "done",
        streamingBlocks: errorBlocks,
      };

    case "agent_generation_cancelled":
      return {
        ...state,
        message: {
          ...state.message,
          status: "cancelled",
        },
        agentState: "done",
      };

    case "agent_message_success":
      // Finalize any streaming block
      const finalBlocks = finalizeCurrentStreamingBlock(state);
      return {
        ...state,
        message: getLightAgentMessageFromAgentMessage(event.message),
        agentState: "done",
        streamingBlocks: finalBlocks,
        currentStreamingContent: null,
        currentStreamingType: null,
      };

    case "generation_tokens": {
      const newState = { ...state };
      switch (event.classification) {
        case "closing_delimiter":
        case "opening_delimiter":
          break;
        case "tokens":
          // If we were streaming thinking content, finalize it
          if (newState.currentStreamingType === "thinking") {
            newState.streamingBlocks = finalizeCurrentStreamingBlock(newState);
            newState.currentStreamingContent = null;
            newState.currentStreamingType = null;
          }
          
          // Now handle regular content
          newState.message.content =
            (newState.message.content || "") + event.text;
          newState.agentState = "writing";
          newState.currentStreamingType = "content";
          break;
          
        case "chain_of_thought":
          // Check if we're switching from a different type
          if (newState.currentStreamingType === "content") {
            // We shouldn't be switching from content to thinking, but handle it
            newState.currentStreamingContent = "";
            newState.currentStreamingType = "thinking";
          } else if (newState.currentStreamingType !== "thinking") {
            // Starting a new thinking session
            newState.currentStreamingContent = "";
            newState.currentStreamingType = "thinking";
          }
          
          // Handle the thinking content
          if (event.text === "\n\n") {
            // This is a separator within thinking - keep accumulating
            // We could optionally finalize here and start a new block
            newState.message.chainOfThought =
              (newState.message.chainOfThought || "") + event.text;
            newState.currentStreamingContent = 
              (newState.currentStreamingContent || "") + event.text;
          } else {
            // Accumulate thinking content
            newState.message.chainOfThought =
              (newState.message.chainOfThought || "") + event.text;
            newState.currentStreamingContent = 
              (newState.currentStreamingContent || "") + event.text;
            
            // Update or add streaming thinking block
            const blocks = [...newState.streamingBlocks];
            const lastBlock = blocks[blocks.length - 1];
            if (lastBlock && lastBlock.type === "thinking" && lastBlock.isStreaming) {
              // Update existing streaming block
              blocks[blocks.length - 1] = {
                ...lastBlock,
                content: newState.currentStreamingContent,
              };
            } else {
              // Add new streaming thinking block
              blocks.push({
                type: "thinking",
                content: newState.currentStreamingContent,
                isStreaming: true
              });
            }
            newState.streamingBlocks = blocks;
          }
          newState.agentState = "thinking";
          break;
        default:
          assertNever(event);
      }
      return newState;
    }
    case "tool_params":
      // Finalize any current streaming block
      const blocks = finalizeCurrentStreamingBlock(state);
      
      // Add the new action block
      blocks.push({
        type: "action",
        action: event.action,
        status: "created"
      });
      
      return {
        ...state,
        message: updateMessageWithAction(state.message, event.action),
        agentState: "acting",
        streamingBlocks: blocks,
        currentStreamingContent: null,
        currentStreamingType: null,
      };

    default:
      assertNever(event);
  }
}
