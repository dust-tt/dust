import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  AgentParticipantType,
  ConversationParticipantsType,
  ConversationWithoutContentType,
  ParticipantActionType,
} from "@app/types/assistant/conversation";
import { ConversationError } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { formatUserFullName } from "@app/types/user";

async function fetchAllUsersById(userIds: ModelId[]) {
  const users = await UserResource.fetchByModelIds(userIds);

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
    variant: "extra_light",
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

  // We fetch agent participants and their last activity from the messages table
  const agentLastActivityResults = await MessageModel.findAll({
    where: {
      conversationId: conversation.id,
      workspaceId: owner.id,
    },
    attributes: [
      [
        frontSequelize.fn("MAX", frontSequelize.col("message.createdAt")),
        "lastActivityAt",
      ],
    ],
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
        attributes: ["agentConfigurationId"],
      },
    ],
    group: ["agentMessage.agentConfigurationId"],
    raw: true,
  });

  const agentConfigurationIds = new Set<string>(
    agentLastActivityResults.map(
      (result: any) => result["agentMessage.agentConfigurationId"] as string
    )
  );

  const agentLastActivityMap = new Map<string, number>(
    agentLastActivityResults.map((result: any) => [
      result["agentMessage.agentConfigurationId"] as string,
      new Date(result.lastActivityAt as string).getTime(),
    ])
  );

  // Fetch user last activity timestamps using aggregation
  const userLastActivityResults = await MessageModel.findAll({
    where: {
      conversationId: conversation.id,
      workspaceId: owner.id,
    },
    attributes: [
      [
        frontSequelize.fn("MAX", frontSequelize.col("message.createdAt")),
        "lastActivityAt",
      ],
    ],
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: true,
        attributes: ["userId"],
      },
    ],
    group: ["userMessage.userId"],
    raw: true,
  });

  const userLastActivityMap = new Map<ModelId, number>(
    userLastActivityResults.map((result: any) => [
      result["userMessage.userId"] as ModelId,
      new Date(result.lastActivityAt as string).getTime(),
    ])
  );

  // We fetch users participants from the conversation participants table
  const participants = await ConversationResource.listParticipantDetails(
    auth,
    conversation
  );
  const userIds = participants.map((p) => p.userId);
  const creatorId = userIds[0]; // The current participant who was added first in the conversation is considered as the creator

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
    agents: agents.map((a) => ({
      ...a,
      lastActivityAt: agentLastActivityMap.get(a.configurationId),
    })),
    users: users.map((u) => ({
      sId: u.sId,
      fullName: u.fullName,
      pictureUrl: u.pictureUrl,
      username: u.username,
      action: userIdToAction.get(u.id) ?? "posted",
      lastActivityAt: userLastActivityMap.get(u.id),
      isCreator: u.id === creatorId,
    })),
  });
}
