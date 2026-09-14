import { Op } from "sequelize";

import { AuthorizedFileAccessModel } from "@app/lib/resources/storage/models/files";
import { makeScript } from "@app/scripts/helpers";

/**
 * Deletes revoked authorized file access rows left over from the append-only model.
 * Run after deploying the delete-and-insert persist path.
 */
makeScript({}, async ({ execute }, logger) => {
  const where = {
    revokedAt: {
      [Op.not]: null,
    },
  };

  if (execute) {
    const deletedCount = await AuthorizedFileAccessModel.destroy({
      where,
      // WORKSPACE_ISOLATION_BYPASS: This migration removes revoked access rows across all workspaces.
      // @ts-expect-error -- This migration operates across all workspaces.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });
    logger.info(
      { deletedCount },
      "Deleted revoked authorized file access rows"
    );
  } else {
    const count = await AuthorizedFileAccessModel.count({
      where,
      // WORKSPACE_ISOLATION_BYPASS: The dry run counts revoked access rows across all workspaces.
      // @ts-expect-error -- This migration operates across all workspaces.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });
    logger.info(
      { count },
      "Dry run - would delete revoked authorized file access rows"
    );
  }
});
