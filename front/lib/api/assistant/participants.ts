import type {
  AgentParticipantType,
  ConversationParticipantsType,
  ConversationWithoutContentType,
  ModelId,
  Result,
  UserParticipantType,
} from "@dust-tt/types";
import { Err, formatUserFullName, Ok } from "@dust-tt/types";
import { Op } from "sequelize";

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessage,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { User } from "@app/lib/models/user";

async function fetchAllUsersById(
  userIds: ModelId[]
): Promise<UserParticipantType[]> {
  const users = (
    await User.findAll({
      attributes: ["firstName", "lastName", "imageUrl", "username"],
      where: {
        id: {
          [Op.in]: userIds,
        },
      },
    })
  ).filter((u) => u !== null) as User[];

  return users.map((u) => ({
    fullName: formatUserFullName(u),
    pictureUrl: u.imageUrl,
    username: u.username,
  }));
}

async function fetchAllAgentsById(
  auth: Authenticator,
  agentConfigurationIds: string[]
): Promise<AgentParticipantType[]> {
  const agents = await getAgentConfigurations({
    auth,
    agentsGetView: { agentIds: agentConfigurationIds },
    variant: "light",
  });

  return agents.map((a) => ({
    configurationId: a.sId,
    name: a.name,
    pictureUrl: a.pictureUrl,
  }));
}

export async function fetchConversationParticipants(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<Result<ConversationParticipantsType, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    return new Err(new Error("Unexpected `auth` without `workspace`."));
  }

  const messages = await Message.findAll({
    where: {
      conversationId: conversation.id,
    },
    include: [
      {
        model: UserMessage,
        as: "userMessage",
        required: false,
        attributes: ["userId"],
      },
      {
        model: AgentMessage,
        as: "agentMessage",
        required: false,
        attributes: ["agentConfigurationId"],
      },
    ],
  });

  const { agentConfigurationIds, userIds } = messages.reduce<{
    agentConfigurationIds: Set<string>;
    userIds: Set<ModelId>;
  }>(
    (acc, m) => {
      const { agentMessage, userMessage } = m;

      if (agentMessage) {
        acc.agentConfigurationIds.add(agentMessage.agentConfigurationId);
      } else if (userMessage && userMessage.userId) {
        acc.userIds.add(userMessage.userId);
      }

      return acc;
    },
    { agentConfigurationIds: new Set(), userIds: new Set() }
  );

  const [users, agents] = await Promise.all([
    fetchAllUsersById([...userIds]),
    fetchAllAgentsById(auth, [...agentConfigurationIds]),
  ]);

  return new Ok({
    agents,
    users,
  });
}
