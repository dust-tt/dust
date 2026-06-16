import { backfillUnavailableSkillReferencesForWorkspace } from "@app/lib/api/skills/backfill_unavailable_references";
import { Authenticator } from "@app/lib/auth";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

makeScript(
  {
    workspaceId: {
      type: "string",
      description:
        "Process skills for a single workspace (sId). Omit to run on all workspaces.",
    },
  },
  async ({ workspaceId, execute }, logger) => {
    let totalCandidates = 0;
    let totalRepaired = 0;
    let totalSkipped = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId,
          { dangerouslyRequestAllGroups: true }
        );

        const stats = await backfillUnavailableSkillReferencesForWorkspace(
          auth,
          { execute }
        );

        totalCandidates += stats.totalCandidates;
        totalRepaired += stats.repaired;
        totalSkipped += stats.skipped;

        logger.info(
          {
            workspaceId: workspace.sId,
            execute,
            ...stats,
          },
          execute
            ? "Backfilled unavailable skill references for workspace"
            : "[DRY RUN] Would backfill unavailable skill references for workspace"
        );
      },
      { wId: workspaceId, concurrency: 4 }
    );

    logger.info(
      {
        workspaceId: workspaceId ?? "all",
        execute,
        totalCandidates,
        repaired: totalRepaired,
        skipped: totalSkipped,
      },
      execute
        ? "Backfilled unavailable skill references"
        : "[DRY RUN] Would backfill unavailable skill references"
    );
  }
);
