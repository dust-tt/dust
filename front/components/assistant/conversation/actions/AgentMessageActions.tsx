import {
  BrainIcon,
  Button,
  Card,
  cn,
  CommandLineIcon,
  ContentMessage,
  Markdown,
  Tooltip,
} from "@dust-tt/sparkle";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
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
  const hasActions = agentMessage.actions.length > 0;
  const chainOfThought = agentMessage.chainOfThought || "Thinking...";
  const onClick = () => {
    openPanel({
      type: "actions",
      messageId: agentMessage.sId,
      metadata: {
        actionProgress,
      },
    });
  };

  if (lastAgentStateClassification === "done" && !hasActions) {
    return null;
  }

  return lastAgentStateClassification !== "done" ? (
    <div
      onClick={lastAction ? onClick : undefined}
      className={cn(
        "flex max-w-[500px] flex-col gap-y-4",
        lastAction ? "cursor-pointer" : ""
      )}
    >
      {isMCPActionType(lastAction) &&
      lastAgentStateClassification === "acting" ? (
        <Card variant="secondary" size="sm">
          <MCPActionDetails
            collapsible={false}
            action={lastAction}
            owner={owner}
            lastNotification={null}
            defaultOpen={true}
            hideOutput={true}
          />
        </Card>
      ) : (
        <div>
          {chainOfThought && (
            <ContentMessage variant="primary">
              <Markdown
                content={chainOfThought}
                isStreaming={false}
                forcedTextSize="text-sm"
                textColor="text-muted-foreground"
                isLastMessage={false}
              />
            </ContentMessage>
          )}
        </div>
      )}
    </div>
  ) : (
    <div className="flex flex-col items-start gap-y-4">
      <Button
        size="sm"
        label="Tools inspection"
        icon={CommandLineIcon}
        variant="outline"
        onClick={onClick}
      />
    </div>
  );
}
