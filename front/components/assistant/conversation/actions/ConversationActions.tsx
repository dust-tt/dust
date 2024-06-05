import { Button, Chip, EyeIcon, Spinner } from "@dust-tt/sparkle";
import type { AgentActionType } from "@dust-tt/types";
import { useEffect, useState } from "react";

import { getActionSpecification } from "@app/components/actions/types";
import { ConversationActionsDrawer } from "@app/components/assistant/conversation/actions/ConversationActionsDrawer";
import type { MessageSizeType } from "@app/components/assistant/conversation/ConversationMessage";

interface ConversationActionsProps {
  actions: AgentActionType[];
  agentMessageContent: string | null;
  isStreaming: boolean;
  size?: MessageSizeType;
}

export function ConversationActions({
  actions,
  agentMessageContent,
  isStreaming,
  size = "normal",
}: ConversationActionsProps) {
  const [chipLabel, setChipLabel] = useState<string | undefined>("Thinking");
  const [isActionDrawerOpened, setIsActionDrawerOpened] = useState(false);

  useEffect(() => {
    const isThinking =
      actions.length === 0 &&
      (!agentMessageContent || agentMessageContent.length === 0);

    if (isThinking) {
      setChipLabel("Thinking");
    } else if (isStreaming && actions.length > 0) {
      setChipLabel(renderActionName(actions));
    } else {
      setChipLabel(undefined);
    }
  }, [actions, agentMessageContent, isStreaming]);

  return (
    <div className="flex flex-col items-start gap-y-4">
      <ConversationActionsDrawer
        actions={actions}
        isOpened={isActionDrawerOpened}
        onClose={() => setIsActionDrawerOpened(false)}
      />
      <ActionChip label={chipLabel} />
      <ActionDetailsButton
        hasActions={actions.length !== 0}
        isStreaming={isStreaming}
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
  isStreaming,
  onClick,
  size,
}: {
  hasActions: boolean;
  isStreaming: boolean;
  onClick: () => void;
  size: MessageSizeType;
}) {
  if (isStreaming || !hasActions) {
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
