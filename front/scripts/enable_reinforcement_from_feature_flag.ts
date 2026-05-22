import { updateWorkspaceMetadata } from "@app/lib/api/workspace";
import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

makeScript({}, async ({ execute }, logger) => {
  let updated = 0;
  let skipped = 0;

  await runOnAllWorkspaces(async (workspace) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const hasFlagEnabled = await hasFeatureFlag(auth, "reinforced_agents");
    if (!hasFlagEnabled) {
      return;
    }

    if (workspace.metadata?.allowReinforcement === true) {
      logger.info(
        { workspaceId: workspace.sId, workspaceName: workspace.name },
        "Already enabled, skipping."
      );
      skipped++;
      return;
    }

    logger.info(
      { workspaceId: workspace.sId, workspaceName: workspace.name },
      execute
        ? "Enabling allowReinforcement."
        : "Would enable allowReinforcement."
    );

    if (execute) {
      const result = await updateWorkspaceMetadata(workspace, {
        allowReinforcement: true,
      });
      if (result.isErr()) {
        logger.error(
          { workspaceId: workspace.sId, error: result.error },
          "Failed to update workspace metadata."
        );
        return;
      }
    }

    updated++;
  });

  logger.info(
    { updated, skipped },
    execute ? "Migration completed." : "Dry run completed."
  );
});
