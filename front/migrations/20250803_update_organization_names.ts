import { updateWorkOSOrganizationName } from "@app/lib/api/workos/organization";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting WorkOS organization name updates");

  await runOnAllWorkspaces(
    async (workspace) => {
      if (!workspace.workOSOrganizationId) {
        return;
      }

      if (execute) {
        const res = await updateWorkOSOrganizationName(workspace);
        if (res.isErr()) {
          logger.error("Failed to update WorkOS organization name", {
            error: res.error,
            workspaceId: workspace.id,
          });
        }
      }
    },
    { concurrency: 1 }
  );

  logger.info("Completed WorkOS organization names");
});
