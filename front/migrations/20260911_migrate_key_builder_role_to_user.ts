import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

/**
 * The `builder` role can no longer be assigned (new keys are created as `user`
 * or `admin`). This flips the remaining legacy public API keys still stored
 * with `role: "builder"` over to `user`.
 *
 * System keys are always created with `role: "admin"`, so they never match; we
 * additionally scope to `isSystem: false` to make the intent explicit.
 */

makeScript({}, async ({ execute }, logger) => {
  let totalMatched = 0;
  let totalMigrated = 0;

  await runOnAllWorkspaces(async (workspace) => {
    const where = {
      workspaceId: workspace.id,
      isSystem: false,
      role: "builder" as const,
    };

    if (!execute) {
      const matched = await KeyModel.count({ where });
      if (matched > 0) {
        totalMatched += matched;
        logger.info(
          {
            workspaceId: workspace.sId,
            workspaceModelId: workspace.id,
            matched,
          },
          "Would flip key builder -> user (DB only)"
        );
      }
      return;
    }

    const [migrated] = await KeyModel.update({ role: "user" }, { where });
    if (migrated > 0) {
      totalMigrated += migrated;
      logger.info(
        {
          workspaceId: workspace.sId,
          workspaceModelId: workspace.id,
          migrated,
        },
        "Flipped key builder -> user (DB only)"
      );
    }
  });

  logger.info(
    execute ? { totalMigrated } : { totalMatched },
    execute
      ? "Key builder -> user migration complete"
      : "Key builder -> user migration dry run complete"
  );
});
