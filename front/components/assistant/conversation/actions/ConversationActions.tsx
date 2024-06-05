import { Button, Chip, EyeIcon } from "@dust-tt/sparkle";
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
  const [chipLabel, setChipLabel] = useState<string | null>("Thinking");
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
      setChipLabel(null);
    }
  }, [actions, agentMessageContent, isStreaming]);

  return (
    <div className="flex flex-col items-start gap-y-4">
      <ConversationActionsDrawer
        actions={actions}
        isOpened={isActionDrawerOpened}
        onClose={() => setIsActionDrawerOpened(false)}
      />
      {chipLabel ? (
        <div
          key={chipLabel}
          className="duration-1000 animate-in fade-in fade-out"
        >
          <Chip size="sm" color="pink" label={chipLabel} isBusy={true}>
            {chipLabel === "Step 1" && (
              <span className="font-normal">
                {actions.map((action) => action.type).join(",")}
              </span>
            )}
          </Chip>
        </div>
      ) : actions.length > 0 ? (
        <Button
          size={size === "normal" ? "sm" : "xs"}
          label="View Actions Details"
          icon={EyeIcon}
          variant="tertiary"
          onClick={() => setIsActionDrawerOpened(true)}
        />
      ) : null}
    </div>
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
    .map((actionType) => getActionSpecification(actionType).name)
    .join(", ");
}
