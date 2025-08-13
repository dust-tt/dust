import {
  AnimatedText,
  Button,
  Card,
  cn,
  CommandLineIcon,
  ContentMessage,
  Markdown,
  Spinner,
} from "@dust-tt/sparkle";

import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { MCPActionType } from "@app/lib/actions/mcp";
import type {
  ActionProgressState,
  AgentStateClassification,
} from "@app/lib/assistant/state/messageReducer";
import type { LightAgentMessageType, LightWorkspaceType } from "@app/types";

interface AgentMessageActionsProps {
  agentMessage: LightAgentMessageType;
  lastAgentStateClassification: AgentStateClassification;
  actionProgress: ActionProgressState;
  owner: LightWorkspaceType;
}

function isMCPActionType(
  action: { type: "tool_action"; id: number } | undefined
): action is MCPActionType {
  return action !== undefined && "functionCallName" in action;
}

export function AgentMessageActions({
  agentMessage,
  lastAgentStateClassification,
  actionProgress,
  owner,
}: AgentMessageActionsProps) {
  const { openPanel } = useConversationSidePanelContext();

  const lastAction = agentMessage.actions[agentMessage.actions.length - 1];
  const hasSidePanelContent =
    agentMessage.actions.length > 0 || agentMessage.chainOfThought;
  const chainOfThought = agentMessage.chainOfThought || "";
  const onClick = () => {
    openPanel({
      type: "actions",
      messageId: agentMessage.sId,
      metadata: {
        actionProgress,
      },
    });
  };

  if (lastAgentStateClassification === "done" && !hasSidePanelContent) {
    return null;
  }

  const lastNotification = actionProgress.get(lastAction?.id)?.progress ?? null;

  return lastAgentStateClassification !== "done" ? (
    <div
      onClick={onClick}
      className={cn(
        "flex max-w-[500px] flex-col gap-y-4",
        lastAction ? "cursor-pointer" : ""
      )}
    >
      {isMCPActionType(lastAction) &&
      lastAgentStateClassification === "acting" ? (
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
          <ContentMessage variant="primary">
            <div className="flex w-full flex-row">
              {!chainOfThought ? (
                <AnimatedText variant="primary">Thinking...</AnimatedText>
              ) : (
                <Markdown
                  content={chainOfThought}
                  isStreaming={false}
                  forcedTextSize="text-sm"
                  textColor="text-muted-foreground"
                  isLastMessage={false}
                />
              )}
              <span className="flex-grow"></span>
              <div className="w-8 self-start pl-4">
                {lastAgentStateClassification === "thinking" && (
                  <Spinner size="xs" />
                )}
              </div>
            </div>
          </ContentMessage>
        </div>
      )}
    </div>
  ) : (
    <div className="flex flex-col items-start gap-y-4">
      <Button
        size="sm"
        label="Message Breakdown"
        icon={CommandLineIcon}
        variant="outline"
        onClick={onClick}
      />
    </div>
  );
}
