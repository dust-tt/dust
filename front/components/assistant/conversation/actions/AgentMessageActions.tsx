import { Button, Chip, CommandLineIcon } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { getActionSpecification } from "@app/components/actions/types";
import { AgentMessageActionsDrawer } from "@app/components/assistant/conversation/actions/AgentMessageActionsDrawer";
import type { AgentStateClassification } from "@app/components/assistant/conversation/AgentMessage";
import type {
  AgentActionType,
  AgentMessageType,
  LightWorkspaceType,
} from "@app/types";
import { assertNever } from "@app/types";

interface AgentMessageActionsProps {
  agentMessage: AgentMessageType;
  lastAgentStateClassification: AgentStateClassification;
  owner: LightWorkspaceType;
}

export function AgentMessageActions({
  agentMessage,
  lastAgentStateClassification,
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
        if (agentMessage.actions.length > 0) {
          setChipLabel(renderActionName(agentMessage.actions));
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
        actions={agentMessage.actions}
        isOpened={isActionDrawerOpened}
        onClose={() => setIsActionDrawerOpened(false)}
        isActing={lastAgentStateClassification === "acting"}
        owner={owner}
      />
      <ActionDetails
        hasActions={agentMessage.actions.length !== 0}
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
      <Chip
        size="sm"
        isBusy
        label={label === "Thinking" ? label : `Thinking, ${label}`}
      />
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

function renderActionName(actions: AgentActionType[]): string {
  const uniqueActionTypes = actions.reduce(
    (acc, action) => {
      if (!acc.includes(action.type)) {
        acc.push(action.type);
      }

      return acc;
    },
    [] as AgentActionType["type"][]
  );

  return uniqueActionTypes
    .map((actionType) => getActionSpecification(actionType).runningLabel)
    .join(", ");
}
