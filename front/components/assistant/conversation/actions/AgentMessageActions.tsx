import { TOOL_RUNNING_LABEL } from "@dust-tt/client";
import { Button, Chip, CommandLineIcon } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import type { ActionProgressState } from "@app/lib/assistant/state/messageReducer";
import type { AgentStateClassification } from "@app/lib/assistant/state/messageReducer";
import type { LightAgentMessageType } from "@app/types";
import { assertNever } from "@app/types";
import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";

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

  return (
    <div className="flex flex-col items-start gap-y-4">
      <ActionDetails
        hasActions={agentMessage.actions.length > 0}
        isActionStepDone={!isThinkingOrActing}
        label={chipLabel}
        onClick={() =>
          openPanel({
            type: "actions",
            messageId: agentMessage.sId,
            metadata: {
              actionProgress,
              isActing: lastAgentStateClassification === "acting",
              messageStatus: agentMessage.status,
            },
          })
        }
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
