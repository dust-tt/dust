import { Op } from "sequelize";

import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

/**
 * The previous migration only handled currently-active `builder` memberships.
 * This script flips the remaining rows: not-yet-started ones (`startAt` in the
 * future) and already-ended ones (`endAt` in the past).
 */

makeScript({}, async ({ execute }, logger) => {
  // Single cutoff for the whole run, so the not-yet-started / already-ended
  // classification stays stable across workspaces regardless of sweep duration.
  const now = new Date();

  let totalMatched = 0;
  let totalMigrated = 0;

  await runOnAllWorkspaces(async (workspace) => {
    const where = {
      workspaceId: workspace.id,
      role: "builder" as const,
      [Op.or]: [{ startAt: { [Op.gt]: now } }, { endAt: { [Op.lt]: now } }],
    };

    if (!execute) {
      const matched = await MembershipModel.count({ where });
      if (matched > 0) {
        totalMatched += matched;
        logger.info(
          {
            workspaceId: workspace.sId,
            workspaceModelId: workspace.id,
            matched,
          },
          "Would flip builder -> user (DB only)"
        );
      }
      return;
    }

    const [migrated] = await MembershipModel.update({ role: "user" }, { where });
    if (migrated > 0) {
      totalMigrated += migrated;
      logger.info(
        {
          workspaceId: workspace.sId,
          workspaceModelId: workspace.id,
          migrated,
        },
        "Flipped builder -> user (DB only)"
      );
    }
  });

  logger.info(
    execute ? { totalMigrated } : { totalMatched },
    execute
      ? "Remaining builder -> user migration complete"
      : "Remaining builder -> user migration dry run complete"
  );
});
