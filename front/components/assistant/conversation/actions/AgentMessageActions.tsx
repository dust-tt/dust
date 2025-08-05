import { TOOL_RUNNING_LABEL } from "@dust-tt/client";
import { Button, Chip, CommandLineIcon } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { useAgentActionsContext } from "@app/components/assistant/conversation/actions/AgentActionsContext";
import type { ActionProgressState } from "@app/lib/assistant/state/messageReducer";
import type { AgentStateClassification } from "@app/lib/assistant/state/messageReducer";
import type { LightAgentMessageType } from "@app/types";
import { assertNever } from "@app/types";

interface AgentMessageActionsProps {
  agentMessage: LightAgentMessageType;
  lastAgentStateClassification: AgentStateClassification;
  actionProgress: ActionProgressState;
}

export function AgentMessageActions({
  agentMessage,
  lastAgentStateClassification,
  actionProgress,
}: AgentMessageActionsProps) {
  const [chipLabel, setChipLabel] = useState<string | undefined>("Thinking");
  const { openActions, setActionState /** isAutoOpenDisabled */ } =
    useAgentActionsContext();
  /**
   * const { isContentOpen } = useInteractiveContentContext();
   */

  // Update action state whenever it changes
  useEffect(() => {
    setActionState(agentMessage.sId, {
      actionProgress,
      isActing: lastAgentStateClassification === "acting",
      messageStatus: agentMessage.status,
    });
  }, [
    agentMessage.sId,
    actionProgress,
    lastAgentStateClassification,
    setActionState,
  ]);

  /**
  
  // Auto-open actions panel when agent starts acting (but respect user preferences)
  useEffect(() => {
    if (
      lastAgentStateClassification === "acting" &&
      agentMessage.actions.length > 0 &&
      !isAutoOpenDisabled &&
      !isContentOpen
    ) {
      openActions(agentMessage.sId);
    }
  }, [
    lastAgentStateClassification,
    agentMessage.actions.length,
    agentMessage.sId,
    openActions,
    isAutoOpenDisabled,
    isContentOpen,
  ]);
  
  */

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
      <ActionDetails
        hasActions={agentMessage.actions.length > 0}
        isActionStepDone={!isThinkingOrActing}
        label={chipLabel}
        onClick={() => openActions(agentMessage.sId, true)}
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
