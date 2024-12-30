import type { ConversationMessageSizeType } from "@dust-tt/sparkle";
import { Button, Chip, CommandLineIcon, Spinner } from "@dust-tt/sparkle";
import type {
  AgentActionType,
  AgentMessageType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { useEffect, useMemo, useState } from "react";

import { getActionSpecification } from "@app/components/actions/types";
import { AgentMessageActionsDrawer } from "@app/components/assistant/conversation/actions/AgentMessageActionsDrawer";
import type { AgentStateClassification } from "@app/components/assistant/conversation/AgentMessage";
import { classNames } from "@app/lib/utils";

interface AgentMessageActionsProps {
  agentMessage: AgentMessageType;
  lastAgentStateClassification: AgentStateClassification;
  size?: ConversationMessageSizeType;
  owner: LightWorkspaceType;
}

export function AgentMessageActions({
  agentMessage,
  lastAgentStateClassification,
  owner,
  size = "normal",
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
        size={size}
      />
    </div>
  );
}

function ActionDetails({
  hasActions,
  label,
  isActionStepDone,
  onClick,
  size,
}: {
  hasActions: boolean;
  label?: string;
  isActionStepDone: boolean;
  onClick: () => void;
  size: ConversationMessageSizeType;
}) {
  // We memoize the spinner as otherwise its state gets resetted on each token emission (despite
  // memoization of label in the parent component).
  const MemoizedSpinner = useMemo(
    () => <Spinner variant="dark" size="xs" />,
    []
  );

  if (!label && (!isActionStepDone || !hasActions)) {
    return null;
  }

  return label ? (
    <div key={label}>
      <Chip size="sm" color="slate" isBusy>
        <div
          className={classNames(
            "flex flex-row items-center gap-x-2 py-2",
            hasActions ? "cursor-pointer" : ""
          )}
          onClick={hasActions ? onClick : undefined}
        >
          {MemoizedSpinner}
          {label === "Thinking" ? (
            <span>{label}</span>
          ) : (
            <span>
              Thinking <span className="text-regular pl-1">{label}</span>
            </span>
          )}
        </div>
      </Chip>
    </div>
  ) : (
    <Button
      size={size === "normal" ? "sm" : "xs"}
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
