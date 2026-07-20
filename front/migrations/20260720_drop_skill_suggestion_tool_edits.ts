import { Authenticator } from "@app/lib/auth";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

makeScript({}, async ({ execute }, logger) => {
  await runOnAllWorkspaces(
    async (workspace) => {
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const suggestions = await SkillSuggestionResource.listByWorkspace(auth, {
        sources: ["reinforcement", "synthetic"],
        dangerouslyBypassConversationsVisibilityCheck: true,
      });
      const withToolEdits = suggestions.filter(
        (s) => "toolEdits" in s.suggestion
      );

      if (withToolEdits.length === 0) {
        return;
      }

      if (!execute) {
        logger.info(
          { workspaceId: workspace.sId, count: withToolEdits.length },
          "Would delete skill suggestions containing legacy toolEdits"
        );
        return;
      }

      const result = await SkillSuggestionResource.bulkDelete(
        auth,
        withToolEdits
      );
      if (result.isErr()) {
        throw result.error;
      }
      logger.info(
        { workspaceId: workspace.sId, deleted: result.value },
        "Deleted skill suggestions containing legacy toolEdits"
      );
    },
    { concurrency: 4 }
  );
});
