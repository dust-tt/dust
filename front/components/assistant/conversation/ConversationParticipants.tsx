import { Avatar } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import React from "react";

import { useConversationParticipants } from "@app/lib/swr/conversations";

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
        nbMoreItems={agents.length > 4 ? agents.length - 4 : 0}
      >
        {agents.slice(0, 4).map((agent) => (
          <Avatar
            name={agent.name}
            visual={agent.pictureUrl}
            size="md"
            key={agent.configurationId}
          />
        ))}
      </Avatar.Stack>
      <Avatar.Stack size="sm" nbMoreItems={Math.max(users.length - 4, 0)}>
        {users.slice(0, 4).map((user, i) => (
          <Avatar
            name={user.fullName || user.username}
            visual={user.pictureUrl}
            size="md"
            key={i}
          />
        ))}
      </Avatar.Stack>
    </div>
  );
}
