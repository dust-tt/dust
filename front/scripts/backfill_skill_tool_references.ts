import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  appendMissingToolRefs,
  toolRefsFromMCPViews,
} from "@app/lib/skills/tool_references";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

type WorkspaceStats = {
  changed: number;
  errors: number;
  processed: number;
  skippedWithoutFlag: number;
  skippedWithoutTools: number;
};

async function processWorkspace(
  workspace: LightWorkspaceType,
  {
    execute,
    includeUnflagged,
  }: {
    execute: boolean;
    includeUnflagged: boolean;
  },
  logger: {
    info: (obj: object, msg: string) => void;
    error: (obj: object, msg: string) => void;
  }
): Promise<WorkspaceStats> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const hasNestedSkills = await hasFeatureFlag(auth, "nested_skills");
  if (!hasNestedSkills && !includeUnflagged) {
    return {
      changed: 0,
      errors: 0,
      processed: 0,
      skippedWithoutFlag: 1,
      skippedWithoutTools: 0,
    };
  }

  const skills = await SkillResource.listByWorkspace(auth, {
    onlyCustom: true,
    status: ["active", "suggested"],
  });

  const stats: WorkspaceStats = {
    changed: 0,
    errors: 0,
    processed: skills.length,
    skippedWithoutFlag: 0,
    skippedWithoutTools: 0,
  };

  for (const skill of skills) {
    if (skill.mcpServerViews.length === 0) {
      stats.skippedWithoutTools++;
      continue;
    }

    const nextContent = appendMissingToolRefs({
      instructions: skill.instructions,
      instructionsHtml: skill.instructionsHtml,
      tools: toolRefsFromMCPViews(skill.mcpServerViews),
    });
    const changed =
      nextContent.instructions !== skill.instructions ||
      nextContent.instructionsHtml !== skill.instructionsHtml;

    if (!changed) {
      continue;
    }

    stats.changed++;
    logger.info(
      {
        execute,
        skillId: skill.sId,
        skillName: skill.name,
        toolCount: skill.mcpServerViews.length,
        workspaceId: workspace.sId,
      },
      execute
        ? "Backfilling skill tool references"
        : "Would backfill skill tool references"
    );

    if (!execute) {
      continue;
    }

    try {
      await SkillConfigurationModel.update(
        {
          instructions: nextContent.instructions,
          instructionsHtml: nextContent.instructionsHtml,
        },
        {
          hooks: false,
          silent: true,
          where: {
            id: skill.id,
            workspaceId: workspace.id,
          },
        }
      );
    } catch (error) {
      stats.errors++;
      logger.error(
        {
          error,
          skillId: skill.sId,
          workspaceId: workspace.sId,
        },
        "Failed to backfill skill tool references"
      );
    }
  }

  return stats;
}

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
    includeUnflagged: {
      default: false,
      describe:
        "Also process workspaces without the nested_skills feature flag.",
      type: "boolean",
    },
    workspaceId: {
      describe:
        "Process skills for a single workspace (sId). Omit to run on all workspaces.",
      type: "string",
    },
  },
  async (
    { concurrency, execute, fromWorkspaceId, includeUnflagged, workspaceId },
    logger
  ) => {
    logger.info(
      {
        concurrency,
        execute,
        fromWorkspaceId,
        includeUnflagged,
        workspaceId: workspaceId ?? "all",
      },
      execute
        ? "Starting skill tool references backfill"
        : "Starting skill tool references backfill dry run"
    );

    const totals: WorkspaceStats = {
      changed: 0,
      errors: 0,
      processed: 0,
      skippedWithoutFlag: 0,
      skippedWithoutTools: 0,
    };

    await runOnAllWorkspaces(
      async (workspace) => {
        const stats = await processWorkspace(
          workspace,
          { execute, includeUnflagged },
          logger
        );
        totals.changed += stats.changed;
        totals.errors += stats.errors;
        totals.processed += stats.processed;
        totals.skippedWithoutFlag += stats.skippedWithoutFlag;
        totals.skippedWithoutTools += stats.skippedWithoutTools;
      },
      {
        concurrency,
        fromWorkspaceId,
        wId: workspaceId,
      }
    );

    logger.info(
      {
        execute,
        ...totals,
        workspaceId: workspaceId ?? "all",
      },
      execute
        ? "Skill tool references backfill complete"
        : "Skill tool references backfill dry run complete"
    );
  }
);
