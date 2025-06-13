import { Op } from "sequelize";

import { AgentMessageContent } from "@app/lib/models/assistant/agent_message_content";
import { AgentStepContentModel } from "@app/lib/models/assistant/agent_step_content";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";
import type { TextContentType } from "@app/types/assistant/agent_message_content";

async function migrateAgentMessageContentsToStepContents(
  workspace: LightWorkspaceType,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  let lastSeenAgentMessageId = 0;
  const batchSize = 100; // Process 100 agent messages at a time
  let totalMessagesProcessed = 0;
  let totalContentsProcessed = 0;
  let totalContentsCreated = 0;
  let totalMessagesSkipped = 0;

  logger.info({ workspaceId: workspace.sId }, "Starting migration");

  for (;;) {
    // Fetch agent messages that have content to migrate
    const agentMessagesWithContent = await AgentMessage.findAll({
      where: {
        id: { [Op.gt]: lastSeenAgentMessageId },
        workspaceId: workspace.id,
      },
      include: [
        {
          model: AgentMessageContent,
          as: "agentMessageContents",
          required: true, // Only get agent messages that have content
          where: {
            workspaceId: workspace.id,
          },
        },
      ],
      order: [["id", "ASC"]],
      limit: batchSize,
    });

    if (agentMessagesWithContent.length === 0) {
      break;
    }

    const agentMessageIds = agentMessagesWithContent.map((am) => am.id);

    // Check which agent messages already have step contents
    const existingStepContents = await AgentStepContentModel.findAll({
      where: {
        agentMessageId: { [Op.in]: agentMessageIds },
        workspaceId: workspace.id,
      },
      attributes: ["agentMessageId"],
      group: ["agentMessageId"],
    });

    // Create a set of agent message IDs that already have step contents
    const agentMessagesWithStepContents = new Set(
      existingStepContents.map((sc) => sc.agentMessageId)
    );

    // Process each agent message
    for (const agentMessage of agentMessagesWithContent) {
      totalMessagesProcessed++;

      // Skip if this agent message already has step contents
      if (agentMessagesWithStepContents.has(agentMessage.id)) {
        totalMessagesSkipped++;
        logger.info(
          {
            workspaceId: workspace.sId,
            agentMessageId: agentMessage.id,
            contentCount: agentMessage.agentMessageContents?.length || 0,
          },
          "Skipping agent message - already has step contents"
        );
        continue;
      }

      const messageContents = agentMessage.agentMessageContents || [];
      totalContentsProcessed += messageContents.length;

      if (messageContents.length > 0) {
        // Sort contents by ID to ensure consistent ordering
        const sortedContents = messageContents.sort((a, b) => a.id - b.id);

        // Group contents by step to assign proper indices
        const contentsByStep = new Map<number, AgentMessageContent[]>();
        for (const content of sortedContents) {
          const stepContents = contentsByStep.get(content.step) || [];
          stepContents.push(content);
          contentsByStep.set(content.step, stepContents);
        }

        // Prepare all step contents for this agent message
        const stepContentsToCreate: Array<{
          agentMessageId: number;
          step: number;
          index: number;
          type: "text_content";
          value: TextContentType;
          workspaceId: number;
          createdAt: Date;
          updatedAt: Date;
        }> = [];
        for (const [, contents] of contentsByStep) {
          // Sort contents within each step by ID and assign indices
          const sortedStepContents = contents.sort((a, b) => a.id - b.id);

          for (let index = 0; index < sortedStepContents.length; index++) {
            const amc = sortedStepContents[index];
            const textContent: TextContentType = {
              type: "text_content",
              value: amc.content,
            };

            stepContentsToCreate.push({
              agentMessageId: amc.agentMessageId,
              step: amc.step,
              index, // Index based on order within the step
              type: "text_content" as const,
              value: textContent,
              workspaceId: workspace.id,
              createdAt: amc.createdAt,
              updatedAt: amc.updatedAt,
            });
          }
        }

        logger.info(
          {
            workspaceId: workspace.sId,
            agentMessageId: agentMessage.id,
            toCreate: stepContentsToCreate.length,
            execute,
          },
          "Step contents to create for agent message"
        );

        if (execute) {
          // Bulk create all step contents for this agent message.
          await AgentStepContentModel.bulkCreate(stepContentsToCreate);

          totalContentsCreated += stepContentsToCreate.length;

          logger.info(
            {
              workspaceId: workspace.sId,
              agentMessageId: agentMessage.id,
              created: stepContentsToCreate.length,
            },
            "Created step contents for agent message"
          );
        }
      }
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        messagesInBatch: agentMessagesWithContent.length,
        totalMessagesProcessed,
        totalMessagesSkipped,
        totalContentsProcessed,
        totalContentsCreated,
      },
      "Completed batch"
    );

    lastSeenAgentMessageId =
      agentMessagesWithContent[agentMessagesWithContent.length - 1].id;
  }

  return {
    totalMessagesProcessed,
    totalMessagesSkipped,
    totalContentsProcessed,
    totalContentsCreated,
  };
}

async function migrateForWorkspace(
  workspace: LightWorkspaceType,
  { execute, logger }: { execute: boolean; logger: Logger }
) {
  logger.info(
    { workspaceId: workspace.sId, execute },
    "Starting workspace migration"
  );

  const {
    totalMessagesProcessed,
    totalMessagesSkipped,
    totalContentsProcessed,
    totalContentsCreated,
  } = await migrateAgentMessageContentsToStepContents(workspace, {
    execute,
    logger,
  });

  logger.info(
    {
      workspaceId: workspace.sId,
      totalMessagesProcessed,
      totalMessagesSkipped,
      totalContentsProcessed,
      totalContentsCreated,
    },
    "Completed workspace migration"
  );
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(
    async (workspace) => {
      await migrateForWorkspace(workspace, { execute, logger });
    },
    { concurrency: 5 }
  );
});
