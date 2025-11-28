import { Op } from "sequelize";

import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";

makeScript({}, async ({ execute }, logger) => {
  let lastSeenId = 0;
  const batchSize = 1000;
  let totalProcessed = 0;
  let totalUpdated = 0;

  for (;;) {
    // Find agent step contents with reasoning type
    const stepContents = await AgentStepContentModel.findAll({
      where: {
        id: {
          [Op.gt]: lastSeenId,
        },
        type: "reasoning",
      },
      order: [["id", "ASC"]],
      limit: batchSize,
    });

    if (stepContents.length === 0) {
      break;
    }

    logger.info(
      `Processing ${stepContents.length} reasoning content items starting from ID ${lastSeenId}`
    );

    const toUpdate: Array<{
      id: number;
      updatedValue: AgentContentItemType;
    }> = [];

    for (const stepContent of stepContents) {
      const value = stepContent.value as AgentContentItemType;
      if (value.type !== "reasoning") {
        throw new Error(
          `Unreachable: expected reasoning content, got ${value.type} for step content ${stepContent.id}`
        );
      }

      const needsUpdate =
        value.value.tokens === undefined || value.value.provider === undefined;

      if (needsUpdate) {
        const updatedValue = {
          ...value,
          value: {
            ...value.value,
            tokens: value.value.tokens ?? 0,
            provider: value.value.provider ?? "openai",
          },
        };

        toUpdate.push({
          id: stepContent.id,
          updatedValue,
        });
      }
    }

    if (toUpdate.length > 0) {
      logger.info(
        `Found ${toUpdate.length} reasoning content items needing updates out of ${stepContents.length} checked`
      );

      if (execute) {
        await concurrentExecutor(
          toUpdate,
          async ({ id, updatedValue }) => {
            await AgentStepContentModel.update(
              { value: updatedValue },
              { where: { id } }
            );
          },
          { concurrency: 10 }
        );

        logger.info(
          `Updated ${toUpdate.length} reasoning content items with default tokens and provider`
        );
        totalUpdated += toUpdate.length;
      } else {
        logger.info(
          `Dry run - would have updated ${toUpdate.length} reasoning content items`
        );
      }
    }

    totalProcessed += stepContents.length;
    lastSeenId = stepContents[stepContents.length - 1].id;
  }

  logger.info(
    {
      totalProcessed,
      totalUpdated: execute
        ? totalUpdated
        : `Would have updated ${totalUpdated}`,
      execute,
    },
    "Backfill complete"
  );
});
