import { Button, CommandLineIcon } from "@dust-tt/sparkle";
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

  if (agentMessage.completedTs === null) {
    return (
      <Button
        icon={CommandLineIcon}
        onClick={onClick}
        size="xs"
        variant={data === agentMessage.sId ? "ghost-secondary" : "ghost"}
      />
    );
  }

  const completedInMs = agentMessage.completedTs - agentMessage.created;

  let statusText = "Completed in";
  if (agentMessage.status === "failed") {
    statusText = "Errored after";
  } else if (agentMessage.status === "cancelled") {
    statusText = "Cancelled after";
  }

  const timeString = formatDurationString(completedInMs);

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
        {statusText} {timeString}
      </span>
      <Button
        icon={CommandLineIcon}
        onClick={onClick}
        size="xs"
        variant={data === agentMessage.sId ? "ghost-secondary" : "ghost"}
      />
    </div>
  );
};
