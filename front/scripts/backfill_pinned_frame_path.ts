import { SpaceResource } from "@app/lib/resources/space_resource";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import { makeScript } from "@app/scripts/helpers";
import { Op } from "sequelize";

// Migrate pinnedFramePath from legacy formats to the canonical scoped path format.
//   "project/file.txt"  �~F~R "pod-{spaceId}/file.txt"
//   "pod/file.txt"      �~F~R "pod-{spaceId}/file.txt"
//   "pod-{sId}/..."     �~F~R unchanged (already canonical)
makeScript({}, async ({ execute }, logger) => {
  const rows = await ProjectMetadataModel.findAll({
    where: {
      pinnedFramePath: { [Op.ne]: null },
    },
    // @ts-expect-error.
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const path = row.pinnedFramePath;
    if (!path) {
      continue;
    }

    if (path.startsWith("pod-")) {
      skipped++;
      continue;
    }

    const spaceId = SpaceResource.modelIdToSId({
      id: row.spaceId,
      workspaceId: row.workspaceId,
    });

    let relativePath: string;
    if (path.startsWith("project/")) {
      relativePath = path.slice("project/".length);
    } else if (path.startsWith("pod/")) {
      relativePath = path.slice("pod/".length);
    } else {
      logger.warn(
        { pinnedFramePath: path, spaceId },
        "Unrecognised pinnedFramePath prefix �~@~T skipping."
      );
      skipped++;
      continue;
    }

    const newPath = `pod-${spaceId}/${relativePath}`;
    logger.info(
      { old: path, new: newPath, spaceId },
      execute ? "Updating pinnedFramePath." : "Would update pinnedFramePath."
    );

    if (execute) {
      await row.update({ pinnedFramePath: newPath });
    }
    updated++;
  }

  logger.info({ updated, skipped, total: rows.length }, "Migration complete.");
});
