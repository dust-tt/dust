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
  let timeString: null | string = null;

  // If we have a completed timestamp, we can show the duration.
  if (agentMessage.completedTs !== null) {
    let statusText = "Completed in";
    if (agentMessage.status === "failed") {
      statusText = "Errored after";
    } else if (agentMessage.status === "cancelled") {
      statusText = "Cancelled after";
    }
    const completedInMs = agentMessage.completedTs - agentMessage.created;
    timeString = formatDurationString(completedInMs);
    displayText = statusText;
  }

  const isOpened = data === agentMessage.sId;

  // For mobile we want to hide the status text ("Completed in" etc) and show only timestamp.
  // But if there is no timestamp and display text is just "Message breakdown" we don't want to hide it.
  const hasCompletedTimestamp = typeof timeString === "string";

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
      <div>
        <span className={hasCompletedTimestamp ? "hidden sm:inline-block" : ""}>
          {displayText}
        </span>
        {hasCompletedTimestamp && <span> {timeString}</span>}
      </div>

      <Icon visual={ChevronRightIcon} size="xs" />
    </div>
  );
};
