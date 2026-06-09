import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

makeScript({}, async ({ execute }, logger) => {
  let deleted = 0;
  let skipped = 0;

  await runOnAllWorkspaces(async (workspace) => {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const hasFlagEnabled = await hasFeatureFlag(auth, "reinforced_agents");
    if (hasFlagEnabled) {
      return;
    }

    const suggestions = await SkillSuggestionResource.listByWorkspace(auth);

    if (suggestions.length === 0) {
      return;
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        workspaceName: workspace.name,
        count: suggestions.length,
      },
      execute
        ? "Deleting skill suggestions."
        : "Would delete skill suggestions."
    );

    if (execute) {
      const result = await SkillSuggestionResource.bulkDelete(
        auth,
        suggestions
      );
      if (result.isErr()) {
        logger.error(
          { workspaceId: workspace.sId, error: result.error },
          "Failed to delete skill suggestions."
        );
        return;
      }
      deleted += result.value;
    } else {
      skipped += suggestions.length;
    }
  });

  logger.info(
    { deleted, skipped },
    execute ? "Migration completed." : "Dry run completed."
  );
});
