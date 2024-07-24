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

function isActionComplete(action: AgentActionType): boolean {
  switch (action.type) {
    case "retrieval_action":
      return action.documents !== null;
    case "tables_query_action":
    case "process_action":
    case "websearch_action":
    case "browse_action":
      return "output" in action ? action.output !== null : false;
    case "dust_app_run_action":
      return action.output !== null && action.runningBlock === null;
    case "visualization_action":
      return action.generation !== null;
    default:
      return false;
  }
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
  const isThinkingOrActing = useMemo(() => {
    return (
      agentMessage.status === "created" &&
      agentMessage.actions.every((action) => !isActionComplete(action))
    );
  }, [agentMessage.status, agentMessage.actions]);

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
        isStreaming={isThinkingOrActing || agentMessage.actions.length === 0}
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
  size: MessageSizeType;
}) {
  if (!label && (!isActionStepDone || !hasActions)) {
    return null;
  }

  return label ? (
    <div key={label} className="animate-fadeIn duration-1000 fade-out">
      <Chip size="sm" color="purple">
        <div
          className="flex flex-row items-center gap-x-2"
          onClick={hasActions ? onClick : undefined}
        >
          <Spinner variant="purple900" size="xs" />
          {label}
        </div>
      </Chip>
    </div>
  ) : (
    <Button
      size={size === "normal" ? "sm" : "xs"}
      label="Tools inspection"
      icon={EyeIcon}
      variant="tertiary"
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
