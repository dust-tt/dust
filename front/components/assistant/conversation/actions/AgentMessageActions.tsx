import {
  AnimatedText,
  Card,
  cn,
  ContentMessage,
  Markdown,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useRef } from "react";

import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type {
  ActionProgressState,
  AgentStateClassification,
} from "@app/lib/assistant/state/messageReducer";
import type {
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
  LightWorkspaceType,
} from "@app/types";
import { isLightAgentMessageWithActionsType } from "@app/types";

interface AgentMessageActionsProps {
  agentMessage: LightAgentMessageType | LightAgentMessageWithActionsType;
  lastAgentStateClassification: AgentStateClassification;
  actionProgress: ActionProgressState;
  owner: LightWorkspaceType;
}

export function AgentMessageActions({
  agentMessage,
  lastAgentStateClassification,
  actionProgress,
  owner,
}: AgentMessageActionsProps) {
  const { openPanel, currentPanel, data } = useConversationSidePanelContext();

  const isAgentMessageWithActions =
    isLightAgentMessageWithActionsType(agentMessage);
  const lastAction = isAgentMessageWithActions
    ? agentMessage.actions[agentMessage.actions.length - 1]
    : null;

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
    ? actionProgress.get(lastAction.id)?.progress ?? null
    : null;

  const showMessageBreakdownButton =
    lastAgentStateClassification === "done" || agentMessage.status === "failed";

  return !showMessageBreakdownButton ? (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-col gap-y-4",
        lastAction ? "cursor-pointer" : ""
      )}
    >
      {lastAction && lastAgentStateClassification === "acting" ? (
        <Card variant="secondary" size="sm">
          <MCPActionDetails
            viewType="conversation"
            action={lastAction}
            owner={owner}
            lastNotification={lastNotification}
            messageStatus={agentMessage.status}
          />
        </Card>
      ) : (
        <div>
          <ContentMessage variant="primary" className="max-w-[1000px] p-3">
            <div className="flex w-full flex-row">
              {!chainOfThought ? (
                <AnimatedText variant="primary">Thinking...</AnimatedText>
              ) : (
                <Markdown
                  content={chainOfThought}
                  isStreaming={false}
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
