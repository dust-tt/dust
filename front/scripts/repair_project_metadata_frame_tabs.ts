/**
 * Repairs Pod `frameTabs` metadata that was relocated as a JSON object (`{}`)
 * instead of an empty JSON array.
 *
 *   npx tsx scripts/repair_project_metadata_frame_tabs.ts --workspaceId <sId> [--execute]
 *
 * Only the exact `{}` shape is rewritten to `[]`. Any other non-array value is
 * logged for manual review.
 */

import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import { makeScript } from "@app/scripts/helpers";
import { Op } from "sequelize";

function isEmptyObject(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

makeScript(
  {
    workspaceId: {
      type: "string",
      describe: "Workspace sId whose Pod metadata should be repaired.",
      demandOption: true,
    },
  },
  async ({ workspaceId, execute }, logger) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspace = auth.getNonNullableWorkspace();

    const metadataRows = await ProjectMetadataModel.findAll({
      where: { workspaceId: workspace.id },
      attributes: ["id", "spaceId", "frameTabs"],
    });

    const repairableRows: ProjectMetadataModel[] = [];
    const manualReviewRows: ProjectMetadataModel[] = [];
    for (const metadata of metadataRows) {
      const frameTabs: unknown = metadata.frameTabs;
      if (Array.isArray(frameTabs)) {
        continue;
      }
      if (isEmptyObject(frameTabs)) {
        repairableRows.push(metadata);
      } else {
        manualReviewRows.push(metadata);
      }
    }

    logger.info(
      {
        workspaceId,
        repairableSpaceIds: repairableRows.map((row) => row.spaceId),
        manualReviewSpaceIds: manualReviewRows.map((row) => row.spaceId),
      },
      "Inspected Pod frame-tab metadata."
    );

    if (manualReviewRows.length > 0) {
      logger.warn(
        {
          workspaceId,
          rows: manualReviewRows.map((row) => ({
            id: row.id,
            spaceId: row.spaceId,
            frameTabsType:
              row.frameTabs === null ? "null" : typeof row.frameTabs,
          })),
        },
        "Found non-array frame-tab values that require manual review."
      );
    }

    if (repairableRows.length === 0 || !execute) {
      return;
    }

    const [repairedCount] = await ProjectMetadataModel.update(
      { frameTabs: [] },
      {
        where: {
          id: { [Op.in]: repairableRows.map((row) => row.id) },
          workspaceId: workspace.id,
        },
      }
    );

    logger.info(
      { workspaceId, repairedCount },
      "Repaired empty Pod frame-tab metadata."
    );
  }
);
