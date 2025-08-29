import { MCPActionDetails } from "@app/ui/components/actions/mcp/details/MCPActionDetails";
import type { ActionProgressState } from "@app/ui/components/assistants/state/messageReducer";
import type { AgentStateClassification } from "@app/ui/components/conversation/AgentMessage";
import type {
  AgentMessagePublicType,
  LightWorkspaceType,
} from "@dust-tt/client";
import {
  AnimatedText,
  Card,
  cn,
  ContentMessage,
  Markdown,
  Spinner,
} from "@dust-tt/sparkle";
interface AgentMessageActionsProps {
  agentMessage: AgentMessagePublicType;
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
  const lastAction = agentMessage.actions[agentMessage.actions.length - 1];
  const hasSidePanelContent =
    agentMessage.actions.length > 0 || agentMessage.chainOfThought;
  const chainOfThought = agentMessage.chainOfThought || "";

  if (lastAgentStateClassification === "done" && !hasSidePanelContent) {
    return null;
  }

  const lastNotification = actionProgress.get(lastAction?.id)?.progress ?? null;

  return (
    lastAgentStateClassification !== "done" && (
      <div
        className={cn(
          "flex flex-col gap-y-4",
          lastAction ? "cursor-pointer" : ""
        )}
      >
        {lastAction && lastAgentStateClassification === "acting" ? (
          <Card variant="secondary" size="sm">
            <MCPActionDetails
              action={lastAction}
              owner={owner}
              lastNotification={lastNotification}
              viewType="conversation"
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
    )
  );
}
