import {
  canUserAccessConversation,
  rebuildConversationRequirements,
} from "@app/lib/api/assistant/conversation/permissions";
import {
  fileSystemStorageModeForPod,
  fileSystemStorageModeForStandaloneConversation,
} from "@app/lib/api/file_system/storage_mode";
import { Authenticator } from "@app/lib/auth";
import type { DustErrorCode } from "@app/lib/error";
import { DustError } from "@app/lib/error";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import {
  ConversationGoneError,
  ConversationSandboxAdapter,
} from "@app/lib/resources/conversation_sandbox_adapter";
import { ConversationSelectedSpaceResource } from "@app/lib/resources/conversation_selected_space_resource";
import { ScopeTransitionDestroyError } from "@app/lib/resources/sandbox_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { PodConversationListItemType } from "@app/types/api/assistant/conversation/spaces";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import {
  getConversationDisplayTitle,
  HIDDEN_MESSAGE_ORIGINS,
} from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";
import uniq from "lodash/uniq";
import uniqBy from "lodash/uniqBy";
import type { WhereOptions } from "sequelize";
import { Op } from "sequelize";
import { getAgentConfigurations } from "../assistant/configuration/agent";

// Maps a scope-transition failure to the move's error union: the caller's
// own validation errors pass through, the under-lock re-fetch miss becomes
// not-found, and a destroy failure is internal — fail closed, the
// association is unchanged and the kill request left behind lets the next
// access finish the sandbox reset.
function toMoveError<E extends DustError<DustErrorCode>>(
  error: E | ConversationGoneError | ScopeTransitionDestroyError
): E | DustError<"conversation_not_found" | "internal_error"> {
  if (error instanceof ConversationGoneError) {
    return new DustError("conversation_not_found", "Conversation not found");
  }
  if (error instanceof ScopeTransitionDestroyError) {
    return new DustError(
      "internal_error",
      `Could not recycle the conversation's sandbox for the move: ${error.message}`
    );
  }
  return error;
}

export async function moveConversationToProject(
  auth: Authenticator,
  {
    conversation,
    currentAgentConversationId,
    spaceId,
  }: {
    conversation: ConversationWithoutContentType;
    currentAgentConversationId?: string;
    spaceId: string;
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
      | "invalid_request_error"
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

  // The destination does not race with the conversation's own state, so it
  // can be validated before the lock as a fast fail.
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
  if (fileSystemStorageModeForPod(project) === "database") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Conversations cannot be moved into or out of a Pod that uses the database-backed filesystem yet."
      )
    );
  }

  // One lifecycle-lock hold covers source validation, the strict sandbox
  // destroy, and the database move — validated against the conversation as
  // re-fetched under the lock, never the caller's snapshot, so a concurrent
  // move cannot slip between validation and commit. The next Computer
  // command recreates the sandbox with the new pod's egress claims, env
  // vars, and mounts.
  const transitionRes = await ConversationSandboxAdapter.withScopeTransition(
    auth,
    conversation,
    {
      prepare: async (
        freshConversation
      ): Promise<
        Result<
          undefined,
          DustError<
            | "internal_error"
            | "invalid_request_error"
            | "space_not_found"
            | "unauthorized"
          >
        >
      > => {
        const sourceSpaceId = freshConversation.spaceSId;
        if (
          !sourceSpaceId &&
          fileSystemStorageModeForStandaloneConversation(freshConversation) ===
            "database"
        ) {
          return new Err(
            new DustError(
              "invalid_request_error",
              "A standalone conversation using the database-backed filesystem cannot be moved into a Pod yet."
            )
          );
        }
        if (sourceSpaceId === project.sId) {
          return new Err(
            new DustError(
              "internal_error",
              "Conversation is already in the project"
            )
          );
        }
        if (sourceSpaceId) {
          const previousProject = await SpaceResource.fetchById(
            auth,
            sourceSpaceId
          );
          if (!previousProject) {
            return new Err(
              new DustError("space_not_found", "Previous project not found")
            );
          }
          if (fileSystemStorageModeForPod(previousProject) === "database") {
            return new Err(
              new DustError(
                "invalid_request_error",
                "Conversations cannot be moved into or out of a Pod that uses the database-backed filesystem yet."
              )
            );
          }
          if (!auth.can("admin", previousProject)) {
            return new Err(
              new DustError(
                "unauthorized",
                `You must be an editor of "${previousProject.name}".`
              )
            );
          }
        }
        return new Ok(undefined);
      },
      commit: async (freshConversation) => {
        await withTransaction(async (t) => {
          // Before moving the conversation, capture the current state:
          // - Current updatedAt timestamp
          // - All participants with their lastReadAt status
          const oldUpdatedAt = freshConversation.updatedAt;
          const participants = await freshConversation.listParticipants(auth);

          // Move the conversation to the project (this will update updatedAt)
          await freshConversation.updateSpaceId(auth, project, t);
          // See front/lib/api/assistant/conversation/mentions.ts updateConversationRequirements for more details
          await freshConversation.updateRequirements(auth, [project.id], t);

          // The requirements above drop every Space the conversation used to require, including the ones
          // that were selected from the input bar. Their selections must go with them: they no longer
          // have any ACL backing, and moving the conversation out of the project later rebuilds
          // requirements from agents and content fragments only, which would make them live again.
          await ConversationSelectedSpaceResource.removeAllForConversation(
            auth,
            {
              conversation: freshConversation,
              transaction: t,
            }
          );

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
              await ConversationResource.markAsReadForAuthUser(
                participantAuth,
                {
                  conversation,
                  transaction: t,
                }
              );
            }
          }
        });

        return new Ok(undefined);
      },
    }
  );
  if (transitionRes.isErr()) {
    return new Err(toMoveError(transitionRes.error));
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
      | "invalid_request_error"
    >
  >
> {
  // Same contract as moveConversationToProject: source validation, the
  // strict sandbox destroy, and the association change happen under one
  // lifecycle-lock hold against the conversation as re-fetched under the
  // lock, so the Pod's egress scope, env vars, and secrets are gone before
  // the conversation is — and a concurrent move cannot double-validate
  // against the same source pod. Participant processing stays outside the
  // lock: it is slow, and not part of the scope the lock protects. The
  // pre-move read state it needs is captured in `prepare` and threaded out.
  const transitionRes = await ConversationSandboxAdapter.withScopeTransition(
    auth,
    conversation,
    {
      prepare: async (
        freshConversation
      ): Promise<
        Result<
          {
            oldUpdatedAt: Date;
            participants: (UserType & { lastReadAt: Date | null })[];
          },
          DustError<
            | "internal_error"
            | "invalid_request_error"
            | "space_not_found"
            | "unauthorized"
          >
        >
      > => {
        const sourceSpaceId = freshConversation.spaceSId;
        if (!sourceSpaceId) {
          return new Err(
            new DustError("internal_error", "Conversation is not in a project")
          );
        }
        const project = await SpaceResource.fetchById(auth, sourceSpaceId);
        if (!project) {
          return new Err(new DustError("space_not_found", "Project not found"));
        }
        if (fileSystemStorageModeForPod(project) === "database") {
          return new Err(
            new DustError(
              "invalid_request_error",
              "Conversations cannot be moved into or out of a Pod that uses the database-backed filesystem yet."
            )
          );
        }
        if (!auth.can("admin", project)) {
          return new Err(
            new DustError(
              "unauthorized",
              `You must be an editor of "${project.name}".`
            )
          );
        }

        // Pre-move read state for the participant processing below:
        // updateSpaceId bumps updatedAt, so it must be captured here.
        const oldUpdatedAt = freshConversation.updatedAt;
        const participants = await freshConversation.listParticipants(auth);
        return new Ok({ oldUpdatedAt, participants });
      },
      commit: async (freshConversation, prep) => {
        // Remove the project association.
        await freshConversation.updateSpaceId(auth, null);

        // Rebuild requestedSpaceIds from all agents and content fragments in
        // the conversation. When a conversation is in a project, its
        // requestedSpaceIds is set to [projectSpaceId] only. Moving out
        // requires recalculating the full set of space requirements.
        await rebuildConversationRequirements(auth, freshConversation);

        return new Ok({ ...prep, freshConversation });
      },
    }
  );
  if (transitionRes.isErr()) {
    return new Err(toMoveError(transitionRes.error));
  }
  const { oldUpdatedAt, participants, freshConversation } = transitionRes.value;

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
      await freshConversation.leaveConversation(participantAuth);
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

      let unreadMessageCount =
        rawMessagesByConversationId[conv.id]?.filter(
          (message) =>
            (message.agentMessage?.completedAt?.getTime() ??
              message.updatedAt.getTime()) > (convJSON.lastReadMs ?? 0)
        ).length ?? 0;

      // The official rule for unread conversation is that it's updated AFTER the last read time as we don't look at individual messages timings.
      // However, as here we are retrieving the exact count of unread messages, we DO look at the individual messages timings.
      // In certain case, the user marked the conversation as read after the last message completion but something updated the conversation after that without adding a new message (for example, a title update).
      // In this case, we force a unread count of 1 to make sure the conversation is displayed as unread in the Pod converations list.
      if (
        unreadMessageCount === 0 &&
        conv.updatedAt > new Date(convJSON.lastReadMs ?? 0)
      ) {
        unreadMessageCount = 1;
      }

      return {
        id: conv.sId,
        title: getConversationDisplayTitle(convJSON),
        created: conv.createdAt.getTime(),
        updated: conv.updatedAt.getTime(),
        replyCount: (rawMessagesByConversationId[conv.id]?.length ?? 1) - 1,
        unreadMessageCount,
        description: firstUserMessage?.userMessage?.content ?? "",
        creator: avatars[0],
        avatars: uniqBy(avatars.slice(1).reverse(), "name"),
        isRunningAgentLoop: conv.isRunningAgentLoop,
        isParticipant: convJSON.isParticipant,
      };
    })
  );
}
