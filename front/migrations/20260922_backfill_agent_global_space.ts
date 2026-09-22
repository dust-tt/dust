import { frontSequelize } from "@app/lib/resources/storage";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { QueryTypes } from "sequelize";

export async function backfillAgentGlobalSpace({
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

  if (!execute) {
    const [{ count }] = await frontSequelize.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM "agent_configurations" WHERE ${missingGlobalSpace}`,
      { replacements, type: QueryTypes.SELECT }
    );
    logger.info(
      { workspaceId: workspace.sId, count },
      "Dry-run: agent configurations missing the global space"
    );
    return;
  }

  // Direct SQL preserves version history and timestamps. Appending to the current SQL array
  // also preserves concurrent edits instead of overwriting them with a previously read value.
  const [, updated] = await frontSequelize.query(
    `UPDATE "agent_configurations"
     SET "requestedSpaceIds" = array_append("requestedSpaceIds", CAST(:globalSpaceId AS bigint))
     WHERE ${missingGlobalSpace}`,
    { replacements, type: QueryTypes.UPDATE }
  );
  logger.info(
    { workspaceId: workspace.sId, updated },
    "Backfilled agent global space"
  );
}

// After executing, run scripts/backfill_agent_search.ts to refresh Elasticsearch documents.
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
      (workspace) => backfillAgentGlobalSpace({ workspace, execute, logger }),
      { wId, fromWorkspaceId: fromWorkspaceModelId }
    );
  }
);
