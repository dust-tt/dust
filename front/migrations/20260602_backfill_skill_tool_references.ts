import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { Authenticator } from "@app/lib/auth";
import { generateShortBlockId } from "@app/lib/generate_short_block_id";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import {
  CREDIT_PRICED_FREE_PLAN_CODE,
  FREE_TRIAL_PHONE_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
  isFreePlan,
} from "@app/lib/plans/plan_codes";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
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
const TRIAL_PLAN_CODES = new Set([
  CREDIT_PRICED_FREE_PLAN_CODE,
  FREE_TRIAL_PHONE_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
]);

type WorkspaceStats = {
  changed: number;
  errors: number;
  processed: number;
  skippedWithoutTools: number;
};

function isPayingOrTrialSubscription(
  subscription: SubscriptionResource
): boolean {
  if (subscription.trialing === true) {
    return true;
  }

  const planCode = subscription.getPlan().code;
  return !isFreePlan(planCode) || TRIAL_PLAN_CODES.has(planCode);
}

async function processWorkspace(
  workspace: LightWorkspaceType,
  {
    execute,
  }: {
    execute: boolean;
  },
  logger: Logger
): Promise<WorkspaceStats> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const skills = await SkillResource.listByWorkspace(auth, {
    onlyCustom: true,
    status: ["active", "archived", "suggested"],
  });

  const stats: WorkspaceStats = {
    changed: 0,
    errors: 0,
    processed: skills.length,
    skippedWithoutTools: 0,
  };

  for (const skill of skills) {
    if (skill.mcpServerViews.length === 0) {
      stats.skippedWithoutTools++;
      continue;
    }

    if (skill.instructions.startsWith(ASSOCIATED_TOOLS_LABEL)) {
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
    payingOrTrialWorkspaces: {
      choices: ["include", "exclude"],
      default: "include",
      describe:
        "Whether to process only paying/trial workspaces or only the others.",
      type: "string",
    },
    wId: {
      describe:
        "Process skills for a single workspace (sId). Omit to run on all workspaces.",
      type: "string",
    },
  },
  async (
    { concurrency, execute, fromWorkspaceId, payingOrTrialWorkspaces, wId },
    logger
  ) => {
    logger.info(
      {
        concurrency,
        execute,
        fromWorkspaceId,
        payingOrTrialWorkspaces,
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
      skippedWithoutTools: 0,
    };

    await runOnAllWorkspaces(
      async (workspace) => {
        const stats = await processWorkspace(workspace, { execute }, logger);
        totals.changed += stats.changed;
        totals.errors += stats.errors;
        totals.processed += stats.processed;
        totals.skippedWithoutTools += stats.skippedWithoutTools;
      },
      {
        concurrency,
        filter: async (workspace) => {
          const subscription =
            await SubscriptionResource.fetchActiveByWorkspaceModelId(
              workspace.id
            );
          const isPayingOrTrial = subscription
            ? isPayingOrTrialSubscription(subscription)
            : false;

          return payingOrTrialWorkspaces === "include"
            ? isPayingOrTrial
            : !isPayingOrTrial;
        },
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
