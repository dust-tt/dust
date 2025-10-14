import { ChevronRightIcon, cn, Icon } from "@dust-tt/sparkle";
import React from "react";

import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { formatDurationString } from "@app/lib/utils/timestamps";
import type {
  LightAgentMessageType,
  LightAgentMessageWithActionsType,
} from "@app/types";

export const AgentMessageCompletionStatus = ({
  agentMessage,
}: {
  agentMessage: LightAgentMessageType | LightAgentMessageWithActionsType;
}) => {
  const { openPanel, data } = useConversationSidePanelContext();

  const onClick = () => {
    openPanel({
      type: "actions",
      messageId: agentMessage.sId,
    });
  };

  if (agentMessage.status === "created") {
    // This message is not completed yet, so we don't need to show the completion status since we have the activity chip.
    return null;
  }

  let displayText = "Message breakdown";

  // If we have a completed timestamp, we can show the duration.
  if (agentMessage.completedTs !== null) {
    let statusText = "Completed in";
    if (agentMessage.status === "failed") {
      statusText = "Errored after";
    } else if (agentMessage.status === "cancelled") {
      statusText = "Cancelled after";
    }
    const completedInMs = agentMessage.completedTs - agentMessage.created;
    const timeString = formatDurationString(completedInMs);
    displayText = `${statusText} ${timeString}`;
  }

  const isOpened = data === agentMessage.sId;

  return (
    <div
      className={cn(
        "flex cursor-pointer items-center gap-1 text-xs",
        "text-muted-foreground dark:text-muted-foreground-night",
        "hover:text-foreground dark:hover:text-foreground-night",
        isOpened && "text-foreground dark:text-foreground-night"
      )}
      onClick={onClick}
    >
      <span>{displayText}</span>
      <Icon visual={ChevronRightIcon} size="xs" />
    </div>
  );
};
