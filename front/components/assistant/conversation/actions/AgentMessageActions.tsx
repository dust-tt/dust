import { TOOL_RUNNING_LABEL } from "@dust-tt/client";
import {
  BrainIcon,
  Button,
  Card,
  cn,
  CommandLineIcon,
  Markdown,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import type { MCPActionType } from "@app/lib/actions/mcp";
import type {
  ActionProgressState,
  AgentStateClassification,
} from "@app/lib/assistant/state/messageReducer";
import type { LightAgentMessageType, LightWorkspaceType } from "@app/types";
import { assertNever } from "@app/types";

interface AgentMessageActionsProps {
  agentMessage: LightAgentMessageType;
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
  const [chipLabel, setChipLabel] = useState<string | undefined>("Thinking");
  const { openPanel } = useConversationSidePanelContext();

  useEffect(() => {
    switch (lastAgentStateClassification) {
      case "thinking":
        setChipLabel("Thinking");
        break;
      case "acting":
        if (agentMessage.actions && agentMessage.actions.length > 0) {
          setChipLabel(TOOL_RUNNING_LABEL);
        }
        break;
      case "done":
        setChipLabel(undefined);
        break;
      default:
        assertNever(lastAgentStateClassification);
    }
  }, [lastAgentStateClassification, agentMessage.actions]);

  const isThinkingOrActing = useMemo(
    () => agentMessage.status === "created",
    [agentMessage.status]
  );

  const lastAction = agentMessage.actions[agentMessage.actions.length - 1];
  return (
    <ActionDetails
      hasActions={agentMessage.actions.length > 0}
      lastAction={isMCPActionType(lastAction) ? lastAction : undefined}
      isActionStepDone={!isThinkingOrActing}
      isActing={lastAgentStateClassification === "acting"}
      label={chipLabel}
      owner={owner}
      chainOfThought={agentMessage.chainOfThought || "..."}
      onClick={() =>
        openPanel({
          type: "actions",
          messageId: agentMessage.sId,
          metadata: {
            actionProgress,
          },
        })
      }
    />
  );
}

function isMCPActionType(
  action: { type: "tool_action"; id: number } | undefined
): action is MCPActionType {
  return action !== undefined && "functionCallName" in action;
}

function ActionDetails({
  hasActions,
  lastAction,
  label,
  isActionStepDone,
  isActing,
  owner,
  chainOfThought,
  onClick,
}: {
  hasActions: boolean;
  lastAction: MCPActionType | undefined;
  label?: string;
  isActionStepDone: boolean;
  isActing: boolean;
  owner: LightWorkspaceType;
  chainOfThought: string;
  onClick: () => void;
}) {
  if (!label && (!isActionStepDone || !hasActions)) {
    return null;
  }

  return label ? (
    <div
      key={label}
      onClick={lastAction ? onClick : undefined}
      className={cn(
        "flex max-w-[500px] flex-col gap-y-4",
        lastAction ? "cursor-pointer" : ""
      )}
    >
      {lastAction && isActing ? (
        <Card variant="secondary" size="md">
          <MCPActionDetails
            action={lastAction}
            owner={owner}
            lastNotification={null}
            defaultOpen={true}
            hideOutput={true}
          />
        </Card>
      ) : (
        <Card variant="secondary" size="md">
          <ActionDetailsWrapper
            actionName={"Thinking"}
            defaultOpen={true}
            visual={BrainIcon}
          >
            <div className="flex flex-col gap-4 pl-6 pt-4 text-red-500 dark:text-muted-foreground-night">
              <Markdown
                content={chainOfThought}
                isStreaming={false}
                forcedTextSize="text-sm"
                textColor="text-muted-foreground dark:text-muted-foreground-night"
                isLastMessage={true}
              />
            </div>
          </ActionDetailsWrapper>
        </Card>
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
