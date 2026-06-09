import {
  backfillCustomizedSkillReferencesForWorkspace,
  type CustomizedSkillReferencesBackfillStats,
} from "@app/lib/resources/skill/customized_skill_references_backfill";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

makeScript(
  {
    concurrency: {
      default: 4,
      describe: "Number of workspaces to process concurrently.",
      type: "number",
    },
    fromWorkspaceId: {
      describe: "Resume from this numeric workspace id.",
      type: "number",
    },
    wId: {
      describe:
        "Process skills for a single workspace (sId). Omit to run on all workspaces.",
      type: "string",
    },
  },
  async ({ concurrency, execute, fromWorkspaceId, wId }, logger) => {
    logger.info(
      {
        concurrency,
        execute,
        fromWorkspaceId,
        workspaceId: wId ?? "all",
      },
      execute
        ? "Starting customized skill references backfill"
        : "Starting customized skill references backfill dry run"
    );

    const totals: CustomizedSkillReferencesBackfillStats = {
      changed: 0,
      errors: 0,
      processed: 0,
    };

    await runOnAllWorkspaces(
      async (workspace) => {
        const stats = await backfillCustomizedSkillReferencesForWorkspace(
          workspace,
          { execute },
          logger
        );
        totals.changed += stats.changed;
        totals.errors += stats.errors;
        totals.processed += stats.processed;
      },
      {
        concurrency,
        fromWorkspaceId,
        wId,
      }
    );

    logger.info(
      {
        execute,
        ...totals,
        workspaceId: wId ?? "all",
      },
      execute
        ? "Customized skill references backfill complete"
        : "Customized skill references backfill dry run complete"
    );
  }
);
