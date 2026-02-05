import { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

/**
 * This migration deletes all tool and skill suggestions.
 * The format has changed from arrays to single-item suggestions,
 * and we simply delete the old ones rather than migrating them.
 */

interface MigrationResult {
  deleted: number;
}

async function deleteToolsAndSkillsSuggestions(
  workspace: LightWorkspaceType,
  {
    execute,
  }: {
    execute: boolean;
  }
): Promise<MigrationResult> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const result: MigrationResult = {
    deleted: 0,
  };

  const allSuggestions = await AgentSuggestionResource.listAll(auth);
  const suggestionsToDelete = allSuggestions.filter(
    (s) => s.kind === "tools" || s.kind === "skills"
  );

  if (suggestionsToDelete.length === 0) {
    return result;
  }

  for (const suggestion of suggestionsToDelete) {
    if (execute) {
      await suggestion.delete(auth);
    }
    result.deleted++;
  }

  return result;
}

makeScript(
  {
    workspaceId: { type: "string", required: false },
  },
  async ({ workspaceId, execute }, logger) => {
    logger.info("Starting tools/skills suggestion deletion");

    const totals: MigrationResult = {
      deleted: 0,
    };

    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }
      const result = await deleteToolsAndSkillsSuggestions(
        renderLightWorkspaceType({ workspace }),
        { execute }
      );
      totals.deleted += result.deleted;
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          const result = await deleteToolsAndSkillsSuggestions(workspace, {
            execute,
          });
          totals.deleted += result.deleted;
        },
        { concurrency: 4 }
      );
    }

    logger.info(
      {
        deleted: totals.deleted,
      },
      "Migration completed"
    );
  }
);
