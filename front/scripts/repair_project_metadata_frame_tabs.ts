/**
 * Repairs Pod frame-tab metadata that was serialized as a JSON object during
 * workspace relocation instead of as a JSON array.
 *
 * Dry run for a workspace:
 *   npx tsx scripts/repair_project_metadata_frame_tabs.ts \
 *     --workspaceId <workspace-sId>
 *
 * Apply the repair:
 *   npx tsx scripts/repair_project_metadata_frame_tabs.ts \
 *     --workspaceId <workspace-sId> --execute
 *
 * The script only repairs the exact `{}` shape. Other non-array values are
 * reported for manual review. It is intentionally idempotent and dry-run by
 * default.
 */

import { Authenticator } from "@app/lib/auth";
import { frontSequelize } from "@app/lib/resources/storage";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";

import { makeScript } from "./helpers";

type FrameTabsRow = {
  id: number;
  spaceId: number;
  frameTabsType: string;
  frameTabs: unknown;
};

function getFrameTabsType(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}

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

    const invalidRows: FrameTabsRow[] = metadataRows.flatMap((metadata) => {
      const frameTabs = metadata.get("frameTabs") as unknown;
      const frameTabsType = getFrameTabsType(frameTabs);
      if (frameTabsType === "array") {
        return [];
      }

      return [
        {
          id: metadata.id,
          spaceId: metadata.spaceId,
          frameTabsType,
          frameTabs,
        },
      ];
    });

    const repairableRows = invalidRows.filter((row) =>
      isEmptyObject(row.frameTabs)
    );
    const repairableIds = new Set(repairableRows.map((row) => row.id));
    const manualReviewRows = invalidRows.filter(
      (row) => !repairableIds.has(row.id)
    );

    logger.info(
      {
        workspaceId,
        repairableCount: repairableRows.length,
        repairableSpaceIds: repairableRows.map((row) => row.spaceId),
        manualReviewCount: manualReviewRows.length,
        manualReviewSpaceIds: manualReviewRows.map((row) => row.spaceId),
      },
      "Inspected Pod frame-tab metadata."
    );

    if (manualReviewRows.length > 0) {
      logger.warn(
        {
          workspaceId,
          rows: manualReviewRows.map(({ id, spaceId, frameTabsType }) => ({
            id,
            spaceId,
            frameTabsType,
          })),
        },
        "Found non-array frame-tab values that require manual review."
      );
    }

    if (repairableRows.length === 0 || !execute) {
      return;
    }

    const repairedCount = await frontSequelize.transaction(
      async (transaction) => {
        let count = 0;
        for (const row of repairableRows) {
          await ProjectMetadataModel.update(
            { frameTabs: [] },
            {
              where: { id: row.id, workspaceId: workspace.id },
              transaction,
            }
          );
          count += 1;
        }
        return count;
      }
    );

    logger.info(
      {
        workspaceId,
        repairedCount,
        repairedSpaceIds: repairableRows.map((row) => row.spaceId),
      },
      "Repaired empty Pod frame-tab metadata."
    );
  }
);
