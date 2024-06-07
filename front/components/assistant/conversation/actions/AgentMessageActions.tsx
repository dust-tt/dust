import { Button, Chip, EyeIcon, Spinner } from "@dust-tt/sparkle";
import type { AgentActionType } from "@dust-tt/types";
import { useEffect, useMemo, useState } from "react";

import { getActionSpecification } from "@app/components/actions/types";
import { AgentMessageActionsDrawer } from "@app/components/assistant/conversation/actions/AgentMessageActionsDrawer";
import type { MessageSizeType } from "@app/components/assistant/conversation/ConversationMessage";

interface AgentMessageActionsProps {
  actions: AgentActionType[];
  agentMessageContent: string | null;
  size?: MessageSizeType;
}

export function AgentMessageActions({
  actions,
  agentMessageContent,
  size = "normal",
}: AgentMessageActionsProps) {
  const [chipLabel, setChipLabel] = useState<string | undefined>("Thinking");
  const [isActionDrawerOpened, setIsActionDrawerOpened] = useState(false);

  // Assuming the action step is complete if the agent message isn't empty.
  // This workaround will be replaced by proper streaming events in the future.
  // Note: This might fail if models send CoT beforehand.
  const agentMessageIsEmpty = useMemo(
    () => !agentMessageContent?.length,
    [agentMessageContent]
  );

  useEffect(() => {
    const isThinking = actions.length === 0 && agentMessageIsEmpty;

    if (isThinking) {
      setChipLabel("Thinking");
    } else if (actions.length > 0 && agentMessageIsEmpty) {
      setChipLabel(renderActionName(actions));
    } else {
      setChipLabel(undefined);
    }
  }, [actions, agentMessageContent, agentMessageIsEmpty]);

  return (
    <div className="flex flex-col items-start gap-y-4">
      <AgentMessageActionsDrawer
        actions={actions}
        isOpened={isActionDrawerOpened}
        onClose={() => setIsActionDrawerOpened(false)}
      />
      <ActionChip label={chipLabel} />
      <ActionDetailsButton
        hasActions={actions.length !== 0}
        isActionStepDone={!agentMessageIsEmpty}
        onClick={() => setIsActionDrawerOpened(true)}
        size={size}
      />
    </div>
  );
}

function ActionChip({ label }: { label?: string }) {
  if (!label) {
    return null;
  }

  return (
    <div key={label} className="animate-fadeIn duration-1000 fade-out">
      <Chip size="sm" color="pink" isBusy={true}>
        <div className="flex flex-row items-center gap-x-2">
          <Spinner variant="pink900" size="xs" />
          {label}
        </div>
      </Chip>
    </div>
  );
}

function ActionDetailsButton({
  hasActions,
  isActionStepDone,
  onClick,
  size,
}: {
  hasActions: boolean;
  isActionStepDone: boolean;
  onClick: () => void;
  size: MessageSizeType;
}) {
  if (!isActionStepDone || !hasActions) {
    return;
  }

  return (
    <Button
      size={size === "normal" ? "sm" : "xs"}
      label="View Actions Details"
      icon={EyeIcon}
      variant="tertiary"
      onClick={onClick}
    />
  );
}

function renderActionName(actions: AgentActionType[]): string {
  const uniqueActionTypes = actions.reduce((acc, action) => {
    if (!acc.includes(action.type)) {
      acc.push(action.type);
    }

    return acc;
  }, [] as AgentActionType["type"][]);

  return uniqueActionTypes
    .map((actionType) => getActionSpecification(actionType).runningLabel)
    .join(", ");
}
