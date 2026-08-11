import {
  canUserAccessConversation,
  rebuildConversationRequirements,
} from "@app/lib/api/assistant/conversation/permissions";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import { ConversationSelectedSpaceResource } from "@app/lib/resources/conversation_selected_space_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { PodConversationListItemType } from "@app/types/api/assistant/conversation/spaces";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import {
  getConversationDisplayTitle,
  HIDDEN_MESSAGE_ORIGINS,
  isPodConversation,
} from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import uniq from "lodash/uniq";
import uniqBy from "lodash/uniqBy";
import type { Transaction, WhereOptions } from "sequelize";
import { Op } from "sequelize";
import { getAgentConfigurations } from "../assistant/configuration/agent";

export async function moveConversationToProject(
  auth: Authenticator,
  {
    conversation,
    currentAgentConversationId,
    spaceId,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    currentAgentConversationId?: string;
    spaceId: string;
    transaction?: Transaction;
  }
): Promise<
  Result<
    void,
    DustError<
      | "internal_error"
      | "unauthorized"
      | "conversation_not_found"
      | "space_not_found"
      | "conversation_agent_running"
    >
  >
> {
  if (
    conversation.isRunningAgentLoop &&
    conversation.sId !== currentAgentConversationId
  ) {
    return new Err(
      new DustError(
        "conversation_agent_running",
        "Wait for the agent to finish before moving this conversation."
      )
    );
  }

  if (isPodConversation(conversation)) {
    if (conversation.spaceId === spaceId) {
      return new Err(
        new DustError(
          "internal_error",
          "Conversation is already in the project"
        )
      );
    } else {
      const previousProject = await SpaceResource.fetchById(
        auth,
        conversation.spaceId
      );
      if (!previousProject) {
        return new Err(
          new DustError("space_not_found", "Previous project not found")
        );
      }

      if (!previousProject.canAdministrate(auth)) {
        return new Err(
          new DustError(
            "unauthorized",
            `You must be an editor of "${previousProject.name}".`
          )
        );
      }
    }
  }

  const project = await SpaceResource.fetchById(auth, spaceId);

  if (!project || !project.isProject()) {
    return new Err(new DustError("space_not_found", "Space not found"));
  }

  if (!project.isMember(auth)) {
    return new Err(
      new DustError(
        "unauthorized",
        `You must be a member of "${project.name}".`
      )
    );
  }

  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversation.sId
  );
  if (!conversationResource) {
    return new Err(
      new DustError("conversation_not_found", "Conversation not found")
    );
  }

  // The scope transition holds the sandbox lifecycle lock across the strict
  // destroy AND the database move: a concurrent Computer command can neither
  // keep the pre-move sandbox alive nor create one from the pre-move scope.
  // The next Computer command recreates the sandbox — with the new pod's
  // egress claims, env vars, and mounts — from the moved conversation. A
  // destroy failure fails the move (fail closed, association unchanged); the
  // kill request it leaves behind lets the next access finish the reset.
  const transitionRes = await ConversationSandboxAdapter.withScopeTransition(
    auth,
    conversationResource,
    async () => {
      await withTransaction(async (t) => {
        // Before moving the conversation, capture the current state:
        // - Current updatedAt timestamp
        // - All participants with their lastReadAt status
        const oldUpdatedAt = conversationResource.updatedAt;
        const participants = await conversationResource.listParticipants(auth);

        // Move the conversation to the project (this will update updatedAt)
        await conversationResource.updateSpaceId(auth, project, t);
        // See front/lib/api/assistant/conversation/mentions.ts updateConversationRequirements for more details
        await conversationResource.updateRequirements(auth, [project.id], t);

        // The requirements above drop every Space the conversation used to require, including the ones
        // that were selected from the input bar. Their selections must go with them: they no longer
        // have any ACL backing, and moving the conversation out of the project later rebuilds
        // requirements from agents and content fragments only, which would make them live again.
        await ConversationSelectedSpaceResource.removeAllForConversation(auth, {
          conversation: conversationResource,
          transaction: t,
        });

        // For participants who had already read the conversation (unread = false),
        // mark them as read using markAsReadForAuthUser to preserve their read status.
        // Participants who were already unread should stay unread.
        const workspaceId = auth.getNonNullableWorkspace().sId;

        for (const participant of participants) {
          // A participant was read if they had a lastReadAt and it was >= oldUpdatedAt
          const wasRead =
            participant.lastReadAt !== null &&
            participant.lastReadAt >= oldUpdatedAt;

          if (wasRead) {
            const participantAuth =
              await Authenticator.fromUserIdAndWorkspaceId(
                participant.sId,
                workspaceId
              );
            await ConversationResource.markAsReadForAuthUser(participantAuth, {
              conversation,
              transaction: t,
            });
          }
        }
      }, transaction);

      return new Ok(undefined);
    }
  );
  if (transitionRes.isErr()) {
    return new Err(
      new DustError(
        "internal_error",
        `Could not recycle the conversation's sandbox for the move: ${transitionRes.error.message}`
      )
    );
  }

  return new Ok(undefined);
}

export async function moveConversationOutOfProject(
  auth: Authenticator,
  {
    conversation,
  }: {
    conversation: ConversationWithoutContentType;
  }
): Promise<
  Result<
    void,
    DustError<
      | "internal_error"
      | "unauthorized"
      | "conversation_not_found"
      | "space_not_found"
    >
  >
> {
  if (!isPodConversation(conversation)) {
    return new Err(
      new DustError("internal_error", "Conversation is not in a project")
    );
  }

  const project = await SpaceResource.fetchById(auth, conversation.spaceId);
  if (!project) {
    return new Err(new DustError("space_not_found", "Project not found"));
  }

  if (!project.canAdministrate(auth)) {
    return new Err(
      new DustError(
        "unauthorized",
        `You must be an editor of "${project.name}".`
      )
    );
  }

  const conversationResource = await ConversationResource.fetchById(
    auth,
    conversation.sId
  );
  if (!conversationResource) {
    return new Err(
      new DustError("conversation_not_found", "Conversation not found")
    );
  }

  // Before moving the conversation, capture the current state:
  // - Current updatedAt timestamp
  // - All participants with their lastReadAt status
  const oldUpdatedAt = conversationResource.updatedAt;
  const participants = await conversationResource.listParticipants(auth);

  // Same contract as moveConversationToProject: strict sandbox destroy and
  // the association change happen under one lifecycle-lock hold, so the Pod's
  // egress scope, env vars, and secrets are gone before the conversation is.
  // Participant processing stays outside the lock — it is slow, and not part
  // of the scope the lock protects.
  const transitionRes = await ConversationSandboxAdapter.withScopeTransition(
    auth,
    conversationResource,
    async () => {
      // Remove the project association.
      await conversationResource.updateSpaceId(auth, null);

      // Rebuild requestedSpaceIds from all agents and content fragments in
      // the conversation. When a conversation is in a project, its
      // requestedSpaceIds is set to [projectSpaceId] only. Moving out
      // requires recalculating the full set of space requirements.
      await rebuildConversationRequirements(auth, conversationResource);

      return new Ok(undefined);
    }
  );
  if (transitionRes.isErr()) {
    return new Err(
      new DustError(
        "internal_error",
        `Could not recycle the conversation's sandbox for the move: ${transitionRes.error.message}`
      )
    );
  }

  const workspaceId = auth.getNonNullableWorkspace().sId;

  for (const participant of participants) {
    // After moving out of a project, some participants may no longer have access
    // to the conversation's required spaces. Remove those participants.
    const hasAccess = await canUserAccessConversation(auth, {
      userId: participant.sId,
      conversationId: conversation.sId,
    });

    if (!hasAccess) {
      const participantAuth = await Authenticator.fromUserIdAndWorkspaceId(
        participant.sId,
        workspaceId
      );
      await conversationResource.leaveConversation(participantAuth);
      continue;
    }

    // For participants who still have access and had already read the conversation,
    // mark them as read to preserve their read status.
    const wasRead =
      participant.lastReadAt !== null && participant.lastReadAt >= oldUpdatedAt;

    if (wasRead) {
      const participantAuth = await Authenticator.fromUserIdAndWorkspaceId(
        participant.sId,
        workspaceId
      );
      await ConversationResource.markAsReadForAuthUser(participantAuth, {
        conversation,
      });
    }
  }

  return new Ok(undefined);
}

export async function toPodConversationListItem(
  auth: Authenticator,
  { conversations }: { conversations: ConversationResource[] }
): Promise<PodConversationListItemType[]> {
  if (conversations.length === 0) {
    return [];
  }
  const where: WhereOptions<MessageModel> = {
    workspaceId: auth.getNonNullableWorkspace().id,
    conversationId: {
      [Op.in]: conversations.map((conv) => conv.id),
    },
    visibility: "visible",
    [Op.or]: [
      {
        userMessageId: {
          [Op.not]: null,
        },
        "$userMessage.userContextOrigin$": {
          [Op.notIn]: HIDDEN_MESSAGE_ORIGINS,
        },
      },
      {
        agentMessageId: {
          [Op.not]: null,
        },
        "$agentMessage.status$": {
          [Op.eq]: "succeeded",
        },
      },
    ],
  };

  const rawMessages = await MessageModel.findAll({
    where,
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: false,
        attributes: [
          "id",
          "userId",
          "content",
          "userContextFullName",
          "userContextProfilePictureUrl",
        ],
      },
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: false,
        attributes: ["id", "completedAt", "agentConfigurationId"],
      },
    ],
    attributes: ["id", "conversationId", "rank", "version", "updatedAt"],
    // Latest version first within each rank so we can keep one row per rank below.
    order: [
      ["rank", "ASC"],
      ["version", "DESC"],
    ],
  });

  // Messages can have multiple versions at the same rank (e.g. agent retries).
  // Keep only the latest version per (conversationId, rank); same pattern as
  // reaction_update.ts and branches.ts.
  const latestMessages: MessageModel[] = [];
  const seenRankByConversationId = new Map<number, Set<number>>();
  for (const message of rawMessages) {
    const seenRanks =
      seenRankByConversationId.get(message.conversationId) ?? new Set<number>();
    if (seenRanks.has(message.rank)) {
      continue;
    }
    seenRanks.add(message.rank);
    seenRankByConversationId.set(message.conversationId, seenRanks);
    latestMessages.push(message);
  }

  const rawMessagesByConversationId = latestMessages.reduce(
    (acc, message) => {
      acc[message.conversationId] = [
        ...(acc[message.conversationId] || []),
        message,
      ];
      return acc;
    },
    {} as Record<number, MessageModel[]>
  );

  const [users, agents] = await Promise.all([
    UserResource.fetchByModelIds(
      uniq(
        removeNulls(
          latestMessages.map((message) => message.userMessage?.userId)
        )
      )
    ),
    getAgentConfigurations(auth, {
      agentIds: uniq(
        removeNulls(
          latestMessages.map(
            (message) => message.agentMessage?.agentConfigurationId
          )
        )
      ),
      variant: "extra_light",
      // We already checked the permissions for the space conversations.
      // We need to skip the permission filtering as we don't want to filter agents that might be using restricted spaces now.
      dangerouslySkipPermissionFiltering: true,
    }),
  ]);

  return removeNulls(
    conversations.map((conv) => {
      const convJSON = conv.toJSON();
      const firstUserMessage = rawMessagesByConversationId[conv.id]?.find(
        (message) => !!message.userMessage
      );
      const avatars = removeNulls(
        (rawMessagesByConversationId[conv.id] ?? []).map((message) => {
          if (message.userMessage) {
            const user = users.find(
              (user) => user.id === message.userMessage!.userId
            );
            return user
              ? {
                  name:
                    user.fullName() ??
                    message.userMessage?.userContextFullName ??
                    "",
                  visual:
                    user.imageUrl ??
                    message.userMessage?.userContextProfilePictureUrl ??
                    "",
                  isRounded: true,
                }
              : {
                  name: message.userMessage?.userContextFullName ?? "",
                  visual:
                    message.userMessage?.userContextProfilePictureUrl ?? "",
                  isRounded: false,
                };
          }

          const agent = agents.find(
            (agent) => agent.sId === message.agentMessage?.agentConfigurationId
          );
          return agent
            ? {
                name: agent.name ?? "",
                visual: agent.pictureUrl ?? "",
                isRounded: false,
              }
            : null;
        })
      );

      return {
        id: conv.sId,
        title: getConversationDisplayTitle(convJSON),
        created: conv.createdAt.getTime(),
        updated: conv.updatedAt.getTime(),
        replyCount: (rawMessagesByConversationId[conv.id]?.length ?? 1) - 1,
        unreadMessageCount:
          rawMessagesByConversationId[conv.id]?.filter(
            (message) =>
              (message.agentMessage?.completedAt?.getTime() ??
                message.updatedAt.getTime()) >
              (convJSON.lastReadMs ?? Date.now())
          ).length ?? 0,
        description: firstUserMessage?.userMessage?.content ?? "",
        creator: avatars[0],
        avatars: uniqBy(avatars.slice(1).reverse(), "name"),
        isRunningAgentLoop: conv.isRunningAgentLoop,
      };
    })
  );
}
