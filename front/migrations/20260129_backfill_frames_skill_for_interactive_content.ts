import type { Logger } from "pino";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { ConversationSkillModel } from "@app/lib/models/skill/conversation_skill";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import {
  FileModel,
  ShareableFileModel,
} from "@app/lib/resources/storage/models/files";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

async function backfillFramesSkillForWorkspace(
  workspace: LightWorkspaceType,
  {
    execute,
    logger: parentLogger,
  }: {
    execute: boolean;
    logger: Logger;
  }
): Promise<void> {
  const logger = parentLogger.child({ workspaceId: workspace.sId });
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // Step 1: we fetch the shareable files, every frame has an associated shareable file created when
  // we upload the content in the tool that creates the frame.
  const shareableFiles = await ShareableFileModel.findAll({
    where: {
      workspaceId: workspace.id,
    },
    include: [
      {
        model: FileModel,
        required: true,
      },
    ],
  });

  if (shareableFiles.length === 0) {
    return;
  }

  // Step 2: we find the corresponding conversations using the use case metadata.
  const conversationIds = new Set<string>();
  for (const shareableFile of shareableFiles) {
    const metadata = shareableFile.file?.useCaseMetadata;
    if (metadata?.conversationId) {
      conversationIds.add(metadata.conversationId);
    }
  }

  if (conversationIds.size === 0) {
    return;
  }

  const conversations = await ConversationResource.fetchByIds(
    auth,
    Array.from(conversationIds),
    { dangerouslySkipPermissionFiltering: true }
  );

  if (conversations.length === 0) {
    return;
  }

  // Step 3: upsert on conversation_skills.
  const existingSkills = await ConversationSkillModel.findAll({
    where: {
      workspaceId: workspace.id,
      conversationId: { [Op.in]: conversations.map((c) => c.id) },
      globalSkillId: "frames",
    },
  });

  const conversationsWithSkill = new Set(
    existingSkills.map((s) => s.conversationId)
  );

  const conversationsNeedingSkill = conversations.filter(
    (c) => !conversationsWithSkill.has(c.id)
  );

  logger.info(
    {
      alreadyHaveSkill: conversationsWithSkill.size,
      needingSkill: conversationsNeedingSkill.length,
      totalConversations: conversations.length,
    },
    "Upserting conversation skills"
  );

  if (conversationsNeedingSkill.length === 0) {
    return;
  }

  let enabledCount = 0;
  await concurrentExecutor(
    conversationsNeedingSkill,
    async (conversation) => {
      logger.info(
        {
          conversationId: conversation.sId,
        },
        "Enabling frames skill for conversation"
      );

      if (execute) {
        await ConversationSkillModel.create({
          workspaceId: workspace.id,
          conversationId: conversation.id,
          globalSkillId: "frames",
          customSkillId: null,
          source: "conversation",
          agentConfigurationId: null,
          addedByUserId: null,
        });
        enabledCount++;
      }
    },
    { concurrency: 8 }
  );

  logger.info({ enabledCount }, "Backfill completed for workspace");
}

makeScript(
  {
    workspaceId: { type: "string", required: false },
  },
  async ({ workspaceId, execute }, logger) => {
    logger.info("Starting backfill.");

    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      await backfillFramesSkillForWorkspace(
        renderLightWorkspaceType({ workspace }),
        {
          execute,
          logger,
        }
      );
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await backfillFramesSkillForWorkspace(workspace, { execute, logger });
        },
        {
          concurrency: 2,
        }
      );
    }

    logger.info("All done.");
  }
);
