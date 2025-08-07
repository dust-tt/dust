import { TOOL_RUNNING_LABEL } from "@dust-tt/client";
import { Button, Card, Chip, CommandLineIcon } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { AgentMessageActionsDrawer } from "@app/components/assistant/conversation/actions/AgentMessageActionsDrawer";
import type { MCPActionType } from "@app/lib/actions/mcp";
import type {
  ActionProgressState,
  AgentStateClassification,
} from "@app/lib/assistant/state/messageReducer";
import type { LightAgentMessageType, LightWorkspaceType } from "@app/types";
import { assertNever } from "@app/types";

interface AgentMessageActionsProps {
  agentMessage: LightAgentMessageType;
  conversationId: string;
  lastAgentStateClassification: AgentStateClassification;
  actionProgress: ActionProgressState;
  owner: LightWorkspaceType;
}

export function AgentMessageActions({
  agentMessage,
  conversationId,
  lastAgentStateClassification,
  actionProgress,
  owner,
}: AgentMessageActionsProps) {
  const [chipLabel, setChipLabel] = useState<string | undefined>("Thinking");
  const [isActionDrawerOpened, setIsActionDrawerOpened] = useState(false);

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
    <div className="flex flex-col items-start gap-y-4">
      <AgentMessageActionsDrawer
        conversationId={conversationId}
        message={agentMessage}
        isOpened={isActionDrawerOpened}
        onClose={() => setIsActionDrawerOpened(false)}
        isActing={lastAgentStateClassification === "acting"}
        actionProgress={actionProgress}
        owner={owner}
      />
      <ActionDetails
        hasActions={agentMessage.actions.length > 0}
        lastAction={isMCPActionType(lastAction) ? lastAction : undefined}
        isActionStepDone={!isThinkingOrActing}
        label={chipLabel}
        owner={owner}
        onClick={() => setIsActionDrawerOpened(true)}
      />
    </div>
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
  owner,
  onClick,
}: {
  hasActions: boolean;
  lastAction: MCPActionType | undefined;
  label?: string;
  isActionStepDone: boolean;
  owner: LightWorkspaceType;
  onClick: () => void;
}) {
  if (!label && (!isActionStepDone || !hasActions)) {
    return null;
  }

  return label ? (
    <div
      key={label}
      onClick={lastAction ? onClick : undefined}
      className={lastAction ? "cursor-pointer" : ""}
    >
      <Chip size="sm" isBusy label={label} />
      {lastAction && (
        <Card variant="secondary" size="md">
          <MCPActionDetails
            action={lastAction}
            owner={owner}
            lastNotification={null}
            defaultOpen={true}
          />
        </Card>
      )}
    </div>
  ) : (
    <Button
      size="sm"
      label="Tools inspection"
      icon={CommandLineIcon}
      variant="outline"
      onClick={onClick}
    />
  );
}
