import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { QueryTypes } from "sequelize";

/**
 * @cc [owner:aubin-tchoi,label:backend;security] backfill-skill-global-space
 * Only execute mode may append the workspace's global space to skills and saved versions
 * missing it. Preserve existing spaces and other fields; repeated runs must not add duplicates.
 */
export async function backfillSkillGlobalSpace({
  workspace,
  execute,
  logger,
}: {
  workspace: LightWorkspaceType;
  execute: boolean;
  logger: Logger;
}): Promise<void> {
  const globalSpace = await SpaceModel.findOne({
    where: { workspaceId: workspace.id, kind: "global" },
  });
  if (!globalSpace) {
    logger.warn(
      { workspaceId: workspace.sId },
      "Skipping workspace without a global space"
    );
    return;
  }

  const replacements = {
    workspaceId: workspace.id,
    globalSpaceId: globalSpace.id,
  };
  const missingGlobalSpace = `"workspaceId" = :workspaceId
    AND NOT ("requestedSpaceIds" @> ARRAY[:globalSpaceId]::bigint[])`;

  // Direct SQL preserves version history and timestamps. Appending to the current SQL array
  // also preserves concurrent edits instead of overwriting them with a previously read value.
  for (const table of ["skill_configurations", "skill_versions"]) {
    if (!execute) {
      const [{ count }] = await frontSequelize.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM "${table}" WHERE ${missingGlobalSpace}`,
        { replacements, type: QueryTypes.SELECT }
      );
      logger.info(
        { workspaceId: workspace.sId, table, count },
        "Dry-run: skills missing the global space"
      );
      continue;
    }

    const [, updated] = await frontSequelize.query(
      `UPDATE "${table}"
       SET "requestedSpaceIds" = array_append("requestedSpaceIds", CAST(:globalSpaceId AS bigint))
       WHERE ${missingGlobalSpace}`,
      { replacements, type: QueryTypes.UPDATE }
    );
    logger.info(
      { workspaceId: workspace.sId, table, updated },
      "Backfilled skill global space"
    );
  }
}

// After executing, run scripts/backfill_skill_search.ts to refresh Elasticsearch documents.
if (process.argv[1]?.endsWith("20260918_backfill_skill_global_space.ts")) {
  makeScript(
    {
      wId: {
        type: "string",
        description: "Workspace ID (omit for all workspaces).",
      },
      fromWorkspaceModelId: {
        type: "number",
        description: "Resume from this workspace model ID.",
      },
    },
    async ({ wId, fromWorkspaceModelId, execute }, logger) => {
      await runOnAllWorkspaces(
        (workspace) => backfillSkillGlobalSpace({ workspace, execute, logger }),
        { wId, fromWorkspaceId: fromWorkspaceModelId }
      );
    }
  );
}
