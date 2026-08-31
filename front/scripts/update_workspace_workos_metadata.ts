import { updateWorkspaceWorkOSMetadata } from "@app/admin/relocate_users";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";
import { isCellType, SUPPORTED_CELLS } from "@app/types/cell";

makeScript(
  {
    workspaceId: {
      alias: "wId",
      describe: "The workspace ID to update",
      type: "string",
      demandOption: true,
    },
    cell: {
      describe: "The cell to set for the workspace",
      type: "string",
      choices: SUPPORTED_CELLS,
      demandOption: true,
    },
  },
  async ({ workspaceId, cell, execute }, logger) => {
    if (!isCellType(cell)) {
      logger.error({ cell }, "Invalid cell type.");
      return;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspace = auth.getNonNullableWorkspace();

    logger.info(
      { workspaceId: workspace.sId, cell, execute },
      "About to update workspace workos metadata"
    );

    const result = await updateWorkspaceWorkOSMetadata(auth, logger, {
      execute,
      newCell: cell,
    });

    if (result.isErr()) {
      logger.error(
        { error: result.error.message },
        "Failed to update workspace workos metadata"
      );
      return;
    }

    logger.info(
      { workspaceId: workspace.sId, cell },
      "Successfully updated workspace workos metadata"
    );
  }
);
