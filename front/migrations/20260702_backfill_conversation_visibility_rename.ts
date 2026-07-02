import { Op } from "sequelize";

import { ConversationModel } from "@app/lib/models/agent/conversation";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { ConversationVisibility } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";

const BATCH_SIZE = 2000;

// Legacy -> renamed visibility values. Readers already tolerate both, so this
// backfill can run at any point after the "expand" phase is deployed.
const VISIBILITY_RENAMES: {
  from: ConversationVisibility;
  to: ConversationVisibility;
}[] = [
  { from: "unlisted", to: "visible" },
  { from: "test", to: "hidden" },
];

async function backfillVisibilityForWorkspace(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  for (const { from, to } of VISIBILITY_RENAMES) {
    let updatedCount = 0;

    // Rows stop matching `visibility = from` once updated, so we can keep
    // reading the head of the table until nothing is left. In dry-run mode we
    // only count (no update happens), so we break after the first read to avoid
    // looping forever.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await ConversationModel.findAll({
        attributes: ["id"],
        where: {
          workspaceId: workspace.id,
          visibility: from,
        },
        order: [["id", "ASC"]],
        limit: BATCH_SIZE,
      });

      if (batch.length === 0) {
        break;
      }

      const ids = batch.map((c) => c.id);

      if (!execute) {
        logger.info(
          {
            workspaceId: workspace.sId,
            from,
            to,
            batchSize: ids.length,
          },
          "[dry-run] Would rename conversation visibility batch"
        );
        break;
      }

      const [affected] = await ConversationModel.update(
        { visibility: to },
        {
          where: {
            workspaceId: workspace.id,
            id: { [Op.in]: ids },
            visibility: from,
          },
        }
      );

      updatedCount += affected;

      if (batch.length < BATCH_SIZE) {
        break;
      }
    }

    if (execute && updatedCount > 0) {
      logger.info(
        {
          workspaceId: workspace.sId,
          from,
          to,
          updatedCount,
        },
        "Renamed conversation visibility"
      );
    }
  }
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: false,
      description: "Run on a single workspace (optional)",
    },
  },
  async ({ execute, workspaceId }, logger) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        await backfillVisibilityForWorkspace(workspace, logger, execute);
      },
      { concurrency: 5, wId: workspaceId }
    );
  }
);
