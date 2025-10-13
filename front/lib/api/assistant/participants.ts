import { Op } from "sequelize";

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessage,
  ConversationParticipantModel,
  Message,
} from "@app/lib/models/assistant/conversation";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type {
  AgentParticipantType,
  ConversationParticipantsType,
  ConversationWithoutContentType,
  ModelId,
  ParticipantActionType,
  Result,
} from "@app/types";
import { ConversationError, Err, formatUserFullName, Ok } from "@app/types";

async function fetchAllUsersById(userIds: ModelId[]) {
  const users = (
    await UserModel.findAll({
      attributes: [
        "id",
        "sId",
        "firstName",
        "lastName",
        "imageUrl",
        "username",
      ],
      where: {
        id: {
          [Op.in]: userIds,
        },
      },
    })
  ).filter((u) => u !== null) as UserModel[];

  return users.map((u) => ({
    id: u.id,
    sId: u.sId,
    fullName: formatUserFullName(u),
    pictureUrl: u.imageUrl,
    username: u.username,
  }));
}

async function fetchAllAgentsById(
  auth: Authenticator,
  agentConfigurationIds: string[]
): Promise<AgentParticipantType[]> {
  const agents = await getAgentConfigurations(auth, {
    agentIds: agentConfigurationIds,
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

  // We fetch agent participants from the messages table
  const messages = await Message.findAll({
    where: {
      conversationId: conversation.id,
      workspaceId: owner.id,
    },
    attributes: [],
    include: [
      {
        model: AgentMessage,
        as: "agentMessage",
        required: true,
        attributes: ["agentConfigurationId"],
      },
    ],
  });

  const { agentConfigurationIds } = messages.reduce<{
    agentConfigurationIds: Set<string>;
  }>(
    (acc, m) => {
      const { agentMessage } = m;

      if (agentMessage) {
        acc.agentConfigurationIds.add(agentMessage.agentConfigurationId);
      }

      return acc;
    },
    { agentConfigurationIds: new Set() }
  );

  // We fetch users participants from the conversation participants table
  const participants = await ConversationParticipantModel.findAll({
    where: {
      conversationId: conversation.id,
      workspaceId: owner.id,
    },
  });
  const userIds = participants.map((p) => p.userId);

  const [users, agents] = await Promise.all([
    fetchAllUsersById([...userIds]),
    fetchAllAgentsById(auth, [...agentConfigurationIds]),
  ]);

  // if less agents than agentConfigurationIds, it means some agents are forbidden
  // to the user
  if (agents.length < agentConfigurationIds.size) {
    return new Err(new ConversationError("conversation_access_restricted"));
  }

  const userIdToAction = new Map<ModelId, ParticipantActionType>(
    participants.map((p) => [p.userId, p.action])
  );

  return new Ok({
    agents,
    users: users.map((u) => ({
      sId: u.sId,
      fullName: u.fullName,
      pictureUrl: u.pictureUrl,
      username: u.username,
      action: userIdToAction.get(u.id) ?? "posted",
    })),
  });
}
