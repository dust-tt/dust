import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { generateShortBlockId } from "@app/lib/generate_short_block_id";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import {
  extractToolTags,
  parseToolTag,
  serializeToolTag,
  TOOL_TAG_NAME,
  type ToolReference,
} from "@app/lib/tools/format";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import * as cheerio from "cheerio";
import type { Logger } from "pino";

const ASSOCIATED_TOOLS_LABEL = "Tools associated with this skill:";
const TOOLS_SECTION_SEPARATOR = "----";
const TOOL_ELEMENT_REGEX = /<tool\b([^>]*)>[\s\S]*?<\/tool>/g;

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
  logger: Logger
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
    status: ["active", "archived", "suggested"],
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

    const tools = skill.mcpServerViews.map((view): ToolReference => {
      const viewType = view.toJSON();

      return {
        icon: viewType.server.icon ?? null,
        id: view.sId,
        name: getMcpServerViewDisplayName(viewType),
      };
    });

    const instructionsToolIds = new Set(
      extractToolTags(skill.instructions).map((tool) => tool.id)
    );
    const missingInInstructions = tools.filter(
      (tool) => !instructionsToolIds.has(tool.id)
    );
    const renderedToolsMarkdown = tools
      .map((tool) => serializeToolTag(tool))
      .join(", ");
    const instructions =
      missingInInstructions.length === 0
        ? skill.instructions
        : `${ASSOCIATED_TOOLS_LABEL} ${renderedToolsMarkdown}\n${TOOLS_SECTION_SEPARATOR}\n${skill.instructions}`;

    const instructionsHtmlToolIds = new Set(
      [
        ...extractToolTags(skill.instructionsHtml ?? ""),
        ...removeNulls(
          [...(skill.instructionsHtml ?? "").matchAll(TOOL_ELEMENT_REGEX)].map(
            (match) => parseToolTag(`<${TOOL_TAG_NAME}${match[1].trimEnd()} />`)
          )
        ),
      ].map((tool) => tool.id)
    );
    const missingInInstructionsHtml = tools.filter(
      (tool) => !instructionsHtmlToolIds.has(tool.id)
    );

    let instructionsHtml = skill.instructionsHtml;
    if (instructionsHtml !== null && missingInInstructionsHtml.length > 0) {
      const renderedToolsHtml = tools
        .map((tool) =>
          serializeToolTag(tool).replace(/\s*\/>$/, `></${TOOL_TAG_NAME}>`)
        )
        .join(", ");
      const paragraph = `<p data-block-id="${generateShortBlockId()}">${ASSOCIATED_TOOLS_LABEL} ${renderedToolsHtml}</p>`;
      const separator = `<p data-block-id="${generateShortBlockId()}">${TOOLS_SECTION_SEPARATOR}</p>`;
      const $ = cheerio.load(instructionsHtml, { xmlMode: false }, false);
      const root = $(
        `[data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"]`
      ).first();

      if (root.length > 0) {
        root.prepend(`${paragraph}${separator}`);
        instructionsHtml = $.html();
      } else {
        instructionsHtml = `${paragraph}\n${separator}\n${instructionsHtml}`;
      }
    }

    const changed =
      instructions !== skill.instructions ||
      instructionsHtml !== skill.instructionsHtml;

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
          instructions,
          instructionsHtml,
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
    wId: {
      describe:
        "Process skills for a single workspace (sId). Omit to run on all workspaces.",
      type: "string",
    },
  },
  async (
    { concurrency, execute, fromWorkspaceId, includeUnflagged, wId },
    logger
  ) => {
    logger.info(
      {
        concurrency,
        execute,
        fromWorkspaceId,
        includeUnflagged,
        workspaceId: wId ?? "all",
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
        ? "Skill tool references backfill complete"
        : "Skill tool references backfill dry run complete"
    );
  }
);
