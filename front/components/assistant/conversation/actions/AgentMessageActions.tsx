import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { MCPImageGenerationGroupedDetails } from "@app/components/actions/mcp/details/MCPImageGenerationActionDetails";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type {
  ActionProgressState,
  AgentStateClassification,
  PendingToolCall,
} from "@app/components/assistant/conversation/types";
import { GENERATE_IMAGE_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
} from "@app/types/assistant/conversation";
import { isLightAgentMessageWithActionsType } from "@app/types/assistant/conversation";
import { asDisplayName } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AnimatedText,
  Card,
  ContentMessage,
  cn,
  Markdown,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

interface AgentMessageActionsProps {
  agentMessage: LightAgentMessageType | LightAgentMessageWithActionsType;
  lastAgentStateClassification: AgentStateClassification;
  actionProgress: ActionProgressState;
  pendingToolCalls: PendingToolCall[];
  owner: LightWorkspaceType;
}

function getPendingToolCallKey(
  pendingToolCall: PendingToolCall,
  index: number
): string {
  if (pendingToolCall.toolCallId) {
    return `id-${pendingToolCall.toolCallId}`;
  }
  if (pendingToolCall.toolCallIndex !== undefined) {
    return `index-${pendingToolCall.toolCallIndex}`;
  }
  return `name-${pendingToolCall.toolName}-${index}`;
}

export function AgentMessageActions({
  agentMessage,
  lastAgentStateClassification,
  actionProgress,
  pendingToolCalls,
  owner,
}: AgentMessageActionsProps) {
  const { openPanel, currentPanel, data } = useConversationSidePanelContext();

  const isAgentMessageWithActions =
    isLightAgentMessageWithActionsType(agentMessage);
  const lastAction = isAgentMessageWithActions
    ? agentMessage.actions[agentMessage.actions.length - 1]
    : null;

  const imageGenerationActions = isAgentMessageWithActions
    ? agentMessage.actions.filter(
        (a) =>
          a.internalMCPServerName === "image_generation" &&
          a.toolName === GENERATE_IMAGE_TOOL_NAME
      )
    : [];

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const chainOfThought = agentMessage.chainOfThought || "";

  const firstRender = useRef<boolean>(true);
  const onClick = () => {
    openPanel({
      type: "actions",
      messageId: agentMessage.sId,
    });
  };

  useEffect(() => {
    // Only if we are in the first rendering, message is empty and panel is open on another message.
    if (
      currentPanel === "actions" &&
      data !== agentMessage.sId &&
      agentMessage.content === null &&
      firstRender.current
    ) {
      openPanel({
        type: "actions",
        messageId: agentMessage.sId,
      });
    }
    firstRender.current = false;
  }, [agentMessage, currentPanel, data, openPanel]);

  const lastNotification = lastAction
    ? (actionProgress.get(lastAction.id)?.progress ?? null)
    : null;

  const showMessageBreakdownButton =
    lastAgentStateClassification === "done" || agentMessage.status === "failed";
  const showPendingToolCalls =
    lastAgentStateClassification !== "acting" && pendingToolCalls.length > 0;

  return !showMessageBreakdownButton ? (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-col gap-y-4",
        lastAction ? "cursor-pointer" : ""
      )}
    >
      {lastAction && lastAgentStateClassification === "acting" ? (
        <Card variant="secondary" className="max-w-xl">
          {imageGenerationActions.length > 1 ? (
            <MCPImageGenerationGroupedDetails
              displayContext="conversation"
              actions={imageGenerationActions}
              owner={owner}
            />
          ) : (
            <MCPActionDetails
              displayContext="conversation"
              action={lastAction}
              owner={owner}
              lastNotification={lastNotification}
              messageStatus={agentMessage.status}
            />
          )}
        </Card>
      ) : showPendingToolCalls ? (
        <ContentMessage variant="primary" className="min-h-fit p-3">
          <div className="flex w-full flex-row">
            <div className="flex flex-col gap-y-1">
              {pendingToolCalls.map((pendingToolCall, index) => (
                <span
                  key={getPendingToolCallKey(pendingToolCall, index)}
                  className="text-sm text-muted-foreground dark:text-muted-foreground-night"
                >
                  Preparing to call{" "}
                  <span className="font-medium text-foreground dark:text-foreground-night">
                    {asDisplayName(pendingToolCall.toolName)}
                  </span>
                  ...
                </span>
              ))}
            </div>
            <span className="flex-grow"></span>
            <div className="w-8 self-start pl-4 pt-0.5">
              <Spinner size="xs" />
            </div>
          </div>
        </ContentMessage>
      ) : (
        <div>
          <ContentMessage variant="primary" className="min-h-fit p-3">
            <div className="flex w-full flex-row">
              {!chainOfThought ? (
                <AnimatedText variant="primary">Thinking...</AnimatedText>
              ) : (
                <Markdown
                  content={chainOfThought}
                  isStreaming={false}
                  streamingState={
                    lastAgentStateClassification === "thinking"
                      ? "streaming"
                      : "none"
                  }
                  enableAnimation
                  animationDurationSeconds={0.3}
                  delimiter=" "
                  forcedTextSize="text-sm"
                  textColor="text-muted-foreground dark:text-muted-foreground-night"
                  isLastMessage={false}
                />
              )}
              <span className="flex-grow"></span>
              <div className="w-8 self-start pl-4 pt-0.5">
                {lastAgentStateClassification === "thinking" && (
                  <Spinner size="xs" />
                )}
              </div>
            </div>
          </ContentMessage>
        </div>
      )}
    </div>
  ) : null;
}
