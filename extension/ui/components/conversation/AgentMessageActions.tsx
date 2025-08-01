import type { AgentStateClassification } from "@app/ui/components/conversation/AgentMessage";
import type {
  AgentMessagePublicType,
  LightWorkspaceType,
} from "@dust-tt/client";
import { assertNever, TOOL_RUNNING_LABEL } from "@dust-tt/client";
import { Chip } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";
interface AgentMessageActionsProps {
  agentMessage: AgentMessagePublicType;
  lastAgentStateClassification: AgentStateClassification;
  owner: LightWorkspaceType;
}

export function AgentMessageActions({
  agentMessage,
  lastAgentStateClassification,
}: AgentMessageActionsProps) {
  const [chipLabel, setChipLabel] = useState<string | undefined>("Thinking");

  useEffect(() => {
    switch (lastAgentStateClassification) {
      case "thinking":
        setChipLabel("Thinking");
        break;
      case "acting":
        if (agentMessage.actions.length > 0) {
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

  // We're thinking or acting if the message status is still "created" and we don't have content
  // yet. Despite our work on chain of thoughts events, it's still possible for content to be
  // emitted before actions in which case we will think we're not thinking or acting until an action
  // gets emitted in which case the content will get requalified as chain of thoughts and this will
  // switch back to true.
  const isThinkingOrActing = useMemo(
    () => agentMessage.status === "created",
    [agentMessage.status]
  );

  return (
    <div className="flex flex-col items-start gap-y-4">
      <ActionDetails
        hasActions={agentMessage.actions.length !== 0}
        isActionStepDone={!isThinkingOrActing}
        label={chipLabel}
      />
    </div>
  );
}

function ActionDetails({
  hasActions,
  label,
  isActionStepDone,
}: {
  hasActions: boolean;
  label?: string;
  isActionStepDone: boolean;
}) {
  if (!label && (!isActionStepDone || !hasActions)) {
    return null;
  }

  return (
    label && (
      <div key={label}>
        <Chip
          size="sm"
          isBusy
          label={label === "Thinking" ? label : `Thinking, ${label}`}
        />
      </div>
    )
  );
}
