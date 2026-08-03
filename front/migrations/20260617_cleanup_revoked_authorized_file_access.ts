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
      // @ts-expect-error -- It's a one-off script that operates across all workspaces
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });
    logger.info(
      { deletedCount },
      "Deleted revoked authorized file access rows"
    );
  } else {
    const count = await AuthorizedFileAccessModel.count({
      where,
      // @ts-expect-error -- It's a one-off script that operates across all workspaces
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });
    logger.info(
      { count },
      "Dry run - would delete revoked authorized file access rows"
    );
  }
});
