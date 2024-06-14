import { Button, Chip, EyeIcon, Spinner } from "@dust-tt/sparkle";
import type { AgentActionType, AgentMessageType } from "@dust-tt/types";
import { useEffect, useMemo, useState } from "react";

import { getActionSpecification } from "@app/components/actions/types";
import { AgentMessageActionsDrawer } from "@app/components/assistant/conversation/actions/AgentMessageActionsDrawer";
import type { MessageSizeType } from "@app/components/assistant/conversation/ConversationMessage";

interface AgentMessageActionsProps {
  agentMessage: AgentMessageType;
  size?: MessageSizeType;
}

export function AgentMessageActions({
  agentMessage,
  size = "normal",
}: AgentMessageActionsProps) {
  const [chipLabel, setChipLabel] = useState<string | undefined>("Thinking");
  const [isActionDrawerOpened, setIsActionDrawerOpened] = useState(false);

  // We're thinking or acting if the message status is still "created" and we don't have content
  // yet. Despite our work on chain of thoughts events, it's still possible for content to be
  // emitted before actions in which case we will think we're not thinking or acting until an action
  // gets emitted in which case the content will get requalified as chain of thoughts and this will
  // switch back to true.
  const isThinkingOrActing = useMemo(
    () => !agentMessage.content?.length && agentMessage.status === "created",
    [agentMessage.content, agentMessage.status]
  );

  useEffect(() => {
    if (isThinkingOrActing) {
      if (agentMessage.actions.length === 0) {
        setChipLabel("Thinking");
      } else {
        setChipLabel(renderActionName(agentMessage.actions));
      }
    } else {
      setChipLabel(undefined);
    }
  }, [isThinkingOrActing, agentMessage.actions]);

  return (
    <div className="flex flex-col items-start gap-y-4">
      <AgentMessageActionsDrawer
        actions={agentMessage.actions}
        isOpened={isActionDrawerOpened}
        onClose={() => setIsActionDrawerOpened(false)}
      />
      <ActionChip label={chipLabel} />
      <ActionDetailsButton
        hasActions={agentMessage.actions.length !== 0}
        isActionStepDone={!isThinkingOrActing}
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
      <Chip size="sm" color="purple">
        <div className="flex flex-row items-center gap-x-2">
          <Spinner variant="purple900" size="xs" />
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
