import { TOOL_RUNNING_LABEL } from "@dust-tt/client";
import { Button, Chip, CommandLineIcon } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { AgentMessageActionsDrawer } from "@app/components/assistant/conversation/actions/AgentMessageActionsDrawer";
import type { ActionProgressState } from "@app/lib/assistant/state/messageReducer";
import type { AgentStateClassification } from "@app/lib/assistant/state/messageReducer";
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
        isActionStepDone={!isThinkingOrActing}
        label={chipLabel}
        onClick={() => setIsActionDrawerOpened(true)}
      />
    </div>
  );
}

function ActionDetails({
  hasActions,
  label,
  isActionStepDone,
  onClick,
}: {
  hasActions: boolean;
  label?: string;
  isActionStepDone: boolean;
  onClick: () => void;
}) {
  if (!label && (!isActionStepDone || !hasActions)) {
    return null;
  }

  return label ? (
    <div
      key={label}
      onClick={hasActions ? onClick : undefined}
      className={hasActions ? "cursor-pointer" : ""}
    >
      <Chip size="sm" isBusy label={label} />
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
