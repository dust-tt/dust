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
import { QueryTypes } from "sequelize";

import { makeScript } from "./helpers";

type FrameTabsRow = {
  id: number;
  spaceId: number;
  frameTabsType: string | null;
};

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

    const invalidRows = await frontSequelize.query<FrameTabsRow>(
      `SELECT
         id,
         "spaceId",
         jsonb_typeof("frameTabs") AS "frameTabsType"
       FROM "project_metadata"
       WHERE "workspaceId" = :workspaceId
         AND jsonb_typeof("frameTabs") <> 'array'
       ORDER BY id`,
      {
        replacements: { workspaceId: workspace.id },
        type: QueryTypes.SELECT,
      }
    );

    const repairableRows = await frontSequelize.query<FrameTabsRow>(
      `SELECT
         id,
         "spaceId",
         jsonb_typeof("frameTabs") AS "frameTabsType"
       FROM "project_metadata"
       WHERE "workspaceId" = :workspaceId
         AND jsonb_typeof("frameTabs") = 'object'
         AND "frameTabs" = '{}'::jsonb
       ORDER BY id`,
      {
        replacements: { workspaceId: workspace.id },
        type: QueryTypes.SELECT,
      }
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

    const [, repairedCount] = await frontSequelize.transaction(
      async (transaction) =>
        frontSequelize.query(
          `UPDATE "project_metadata"
           SET "frameTabs" = '[]'::jsonb,
               "updatedAt" = NOW()
           WHERE "workspaceId" = :workspaceId
             AND jsonb_typeof("frameTabs") = 'object'
             AND "frameTabs" = '{}'::jsonb`,
          {
            replacements: { workspaceId: workspace.id },
            type: QueryTypes.UPDATE,
            transaction,
          }
        )
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
