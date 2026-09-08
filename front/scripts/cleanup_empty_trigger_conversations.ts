import { Authenticator } from "@app/lib/auth";
import {
  ConversationParticipantModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import { QueryTypes } from "sequelize";

/**
 * Finds and soft-deletes empty conversations created by one trigger for one
 * user during a bounded time window. The script is dry-run by default.
 */
interface EmptyTriggeredConversation {
  id: number;
  sId: string;
  createdAt: Date;
  visibility: string;
}

function parseTimestamp(value: string, name: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be a valid ISO-8601 timestamp.`);
  }
  return date;
}

makeScript(
  {
    workspaceSId: {
      alias: "w",
      describe: "Workspace sId owning the conversations.",
      type: "string" as const,
      demandOption: true,
    },
    userSId: {
      alias: "u",
      describe:
        "The specific workspace user sId whose private conversations may be removed.",
      type: "string" as const,
      demandOption: true,
    },
    triggerSId: {
      alias: "t",
      describe: "The trigger sId that created the conversations.",
      type: "string" as const,
      demandOption: true,
    },
    from: {
      describe: "Inclusive start of the failed-run window, as ISO-8601.",
      type: "string" as const,
      demandOption: true,
    },
    to: {
      describe: "Exclusive end of the failed-run window, as ISO-8601.",
      type: "string" as const,
      demandOption: true,
    },
    maxCandidates: {
      describe:
        "Safety limit for the number of conversations that may be selected.",
      type: "number" as const,
      default: 1000,
    },
  },
  async (
    {
      workspaceSId,
      userSId,
      triggerSId,
      from,
      to,
      maxCandidates,
      execute,
    },
    logger
  ) => {
    if (maxCandidates <= 0) {
      throw new Error("maxCandidates must be greater than zero.");
    }

    const fromDate = parseTimestamp(from, "from");
    const toDate = parseTimestamp(to, "to");
    if (fromDate >= toDate) {
      throw new Error("from must be earlier than to.");
    }

    const workspace = await WorkspaceResource.fetchById(workspaceSId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceSId}`);
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const user = await UserModel.findOne({
      where: { sId: userSId },
    });
    if (!user) {
      throw new Error(`User not found: ${userSId}`);
    }

    const trigger = await TriggerResource.fetchById(auth, triggerSId);
    if (!trigger) {
      throw new Error(
        `Trigger ${triggerSId} was not found in workspace ${workspaceSId}.`
      );
    }

    const candidates = await frontSequelize.query<EmptyTriggeredConversation>(
      `
      SELECT
        c.id,
        c."sId",
        c."createdAt",
        c.visibility
      FROM conversations c
      WHERE c."workspaceId" = :workspaceId
        AND c."triggerId" = :triggerId
        AND c."createdAt" >= :from
        AND c."createdAt" < :to
        AND c.visibility <> 'deleted'
        AND EXISTS (
          SELECT 1
          FROM conversation_participants cp
          WHERE cp."workspaceId" = c."workspaceId"
            AND cp."conversationId" = c.id
            AND cp."userId" = :userId
        )
        AND NOT EXISTS (
          SELECT 1
          FROM conversation_participants cp_other
          WHERE cp_other."workspaceId" = c."workspaceId"
            AND cp_other."conversationId" = c.id
            AND cp_other."userId" <> :userId
        )
        AND NOT EXISTS (
          SELECT 1
          FROM messages m
          WHERE m."workspaceId" = c."workspaceId"
            AND m."conversationId" = c.id
        )
      ORDER BY c."createdAt" ASC, c.id ASC
      LIMIT :candidateLimit
      `,
      {
        replacements: {
          workspaceId: workspace.id,
          userId: user.id,
          triggerId: trigger.id,
          from: fromDate,
          to: toDate,
          candidateLimit: maxCandidates + 1,
        },
        type: QueryTypes.SELECT,
      }
    );

    if (candidates.length > maxCandidates) {
      throw new Error(
        `Selection exceeded maxCandidates=${maxCandidates}. Refusing to continue.`
      );
    }

    logger.info(
      {
        workspaceSId,
        userSId,
        triggerSId,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        candidateCount: candidates.length,
        execute,
      },
      execute
        ? "Starting targeted empty triggered conversation cleanup"
        : "[DRY RUN] Found empty triggered conversations"
    );

    for (const candidate of candidates) {
      logger.info(
        {
          conversationId: candidate.sId,
          createdAt: candidate.createdAt,
          visibility: candidate.visibility,
        },
        execute
          ? "Candidate conversation selected for cleanup"
          : "[DRY RUN] Would soft-delete empty triggered conversation"
      );
    }

    if (!execute || candidates.length === 0) {
      return;
    }

    let deletedCount = 0;
    let skippedCount = 0;

    const conversations = await ConversationResource.fetchByIds(
      auth,
      candidates.map(({ sId }) => sId),
      { includeDeleted: true }
    );

    for (const conversation of conversations) {
      const messageCount = await MessageModel.count({
        where: {
          workspaceId: workspace.id,
          conversationId: conversation.id,
        },
      });

      const participants = await ConversationParticipantModel.findAll({
        where: {
          workspaceId: workspace.id,
          conversationId: conversation.id,
        },
      });

      const isStillSafeToDelete =
        messageCount === 0 &&
        participants.length === 1 &&
        participants[0].userId === user.id &&
        conversation.visibility !== "deleted";

      if (!isStillSafeToDelete) {
        skippedCount++;
        logger.warn(
          {
            conversationId: conversation.sId,
            messageCount,
            participantCount: participants.length,
            visibility: conversation.visibility,
          },
          "Skipping conversation because it no longer matches the cleanup scope"
        );
        continue;
      }

      await conversation.removeAllParticipants(auth);
      await conversation.updateVisibilityToDeleted(auth);
      deletedCount++;

      logger.info(
        { conversationId: conversation.sId },
        "Soft-deleted empty triggered conversation"
      );
    }

    logger.info(
      {
        candidateCount: candidates.length,
        deletedCount,
        skippedCount,
      },
      "Targeted empty triggered conversation cleanup complete"
    );
  }
);
