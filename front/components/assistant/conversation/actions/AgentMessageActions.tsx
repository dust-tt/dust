import type { ConversationMessageSizeType } from "@dust-tt/sparkle";
import { Button, Chip, CommandLineIcon, Spinner } from "@dust-tt/sparkle";
import type {
  AgentActionType,
  AgentMessageType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useEffect, useMemo, useState } from "react";

import { getActionSpecification } from "@app/components/actions/types";
import { AgentMessageActionsDrawer } from "@app/components/assistant/conversation/actions/AgentMessageActionsDrawer";
import { classNames } from "@app/lib/utils";
interface AgentMessageActionsProps {
  agentMessage: AgentMessageType;
  size?: ConversationMessageSizeType;
  owner: LightWorkspaceType;
}

export function AgentMessageActions({
  agentMessage,
  owner,
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
    () => agentMessage.status === "created",
    [agentMessage.status]
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
        isStreaming={isThinkingOrActing || agentMessage.actions.length === 0}
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
  if (!label && (!isActionStepDone || !hasActions)) {
    return null;
  }

  return label ? (
    <div key={label} className="animate-fadeIn duration-1000 fade-out">
      <Chip size="sm" color="slate" isBusy>
        <div
          className={classNames(
            "flex flex-row items-center gap-x-2",
            hasActions ? "cursor-pointer" : ""
          )}
          onClick={hasActions ? onClick : undefined}
        >
          <Spinner variant="dark" size="xs" />
          {label}
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
