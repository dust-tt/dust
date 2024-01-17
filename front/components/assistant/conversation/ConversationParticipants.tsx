import { Avatar } from "@dust-tt/sparkle";
import type { ConversationType } from "@dust-tt/types";
import React from "react";

export function ConversationParticipants({
  conversation,
}: {
  conversation: ConversationType;
}) {
  type UserParticipant = {
    username: string;
    fullName: string | null;
    pictureUrl: string | null;
  };
  type AgentParticipant = {
    configurationId: string;
    name: string;
    pictureUrl: string;
  };
  const userParticipantsMap = new Map<string, UserParticipant>();
  const agentParticipantsMap = new Map<string, AgentParticipant>();
  conversation.content.map((messages) => {
    messages.map((m) => {
      if (m.type === "user_message") {
        const key = `${m.context.username}-${m.context.profilePictureUrl}`;
        if (!userParticipantsMap.has(key)) {
          userParticipantsMap.set(key, {
            username: m.context.username,
            fullName: m.context.fullName,
            pictureUrl: m.context.profilePictureUrl,
          });
        }
      } else if (m.type === "agent_message") {
        const key = `${m.configuration.sId}`;
        if (!agentParticipantsMap.has(key)) {
          agentParticipantsMap.set(key, {
            configurationId: m.configuration.sId,
            name: m.configuration.name,
            pictureUrl: m.configuration.pictureUrl,
          });
        }
      }
    });
  });
  const userParticipants = Array.from(userParticipantsMap.values());
  const agentParticipants = Array.from(agentParticipantsMap.values());

  return (
    <div className="flex gap-6">
      <Avatar.Stack
        size="sm"
        nbMoreItems={
          agentParticipants.length > 4 ? agentParticipants.length - 4 : 0
        }
      >
        {agentParticipants.slice(0, 4).map((agent) => (
          <Avatar
            name={agent.name}
            visual={agent.pictureUrl}
            size="md"
            key={agent.configurationId}
          />
        ))}
      </Avatar.Stack>
      <Avatar.Stack
        size="sm"
        nbMoreItems={
          userParticipants.length > 4 ? userParticipants.length - 4 : 0
        }
      >
        {userParticipants.slice(0, 4).map((user, i) => (
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
