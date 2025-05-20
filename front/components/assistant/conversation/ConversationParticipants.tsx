import { Avatar } from "@dust-tt/sparkle";
import React from "react";

import { useConversationParticipants } from "@app/lib/swr/conversations";
import type { WorkspaceType } from "@app/types";

interface ConversationParticipantsProps {
  conversationId: string;
  owner: WorkspaceType;
}

export function ConversationParticipants({
  conversationId,
  owner,
}: ConversationParticipantsProps) {
  const { conversationParticipants } = useConversationParticipants({
    conversationId,
    workspaceId: owner.sId,
  });

  if (!conversationParticipants) {
    return null;
  }

  const { agents, users } = conversationParticipants;

  return (
    <div className="flex gap-6">
      <Avatar.Stack
        size="sm"
        nbVisibleItems={agents.length > 4 ? agents.length - 4 : 0}
        avatars={agents.slice(0, 4).map((agent) => ({
          name: agent.name,
          visual: agent.pictureUrl,
          size: "md",
        }))}
      />
      <Avatar.Stack
        size="sm"
        nbVisibleItems={Math.max(users.length - 4, 0)}
        avatars={users.slice(0, 4).map((user) => ({
          name: user.fullName || user.username,
          visual: user.pictureUrl,
          size: "md",
        }))}
      />
    </div>
  );
}
