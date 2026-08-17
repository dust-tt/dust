import { Authenticator } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { convertMarkdownToBlockHtml } from "@app/lib/reinforcement/skill_instructions_html";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { parseSkillTag } from "@app/lib/skills/format";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { GROUP_KINDS, isAgentEditorGroupKind } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

const CUSTOMIZATION_LABEL = "This skill is a customization of";

const OFFICE_SKILL_IDS = new Set(["docx", "pptx", "xlsx"]);

const CUSTOMIZATION_REFERENCE_REGEX = new RegExp(
  `${CUSTOMIZATION_LABEL}\\s*(<skill\\s+[^>]*?\\s*(?:/>|></skill>))`,
  "g"
);

function rewriteCustomizationDirective(instructions: string): string | null {
  let rewritten = false;

  const next = instructions.replace(
    CUSTOMIZATION_REFERENCE_REGEX,
    (match, tag: string) => {
      const skill = parseSkillTag(tag);

      if (!skill || !OFFICE_SKILL_IDS.has(skill.id)) {
        return match;
      }

      rewritten = true;

      return `Always load ${tag} when using this skill.`;
    }
  );

  return rewritten ? next : null;
}

async function rewriteWorkspaceOfficeSkillDirectives(
  workspace: LightWorkspaceType,
  { execute }: { execute: boolean },
  logger: Logger
): Promise<number> {
  const rows = await SkillConfigurationModel.findAll({
    attributes: ["id"],
    where: {
      workspaceId: workspace.id,
      status: "active",
      instructions: { [Op.like]: `%${CUSTOMIZATION_LABEL}%` },
    },
  });

  if (rows.length === 0) {
    return 0;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
    groupKinds: GROUP_KINDS.filter((k) => !isAgentEditorGroupKind(k)),
  });
  const skills = await SkillResource.fetchByModelIds(
    auth,
    rows.map((row) => row.id)
  );

  let rewrittenCount = 0;

  for (const skill of skills) {
    const instructions = rewriteCustomizationDirective(skill.instructions);

    if (instructions === null) {
      continue;
    }

    rewrittenCount++;
    logger.info(
      { skillId: skill.sId, workspaceId: workspace.sId },
      execute
        ? "Rewriting office skill directive"
        : "Would rewrite office skill directive"
    );

    if (!execute) {
      continue;
    }

    await skill.updateSkill(auth, {
      agentFacingDescription: skill.agentFacingDescription,
      attachedKnowledge: await skill.getAttachedKnowledge(auth),
      icon: skill.icon,
      instructions,
      instructionsHtml: convertMarkdownToBlockHtml(instructions),
      mcpServerViews: skill.mcpServerViews,
      name: skill.name,
      requestedSpaceIds: skill.requestedSpaceIds,
      userFacingDescription: skill.userFacingDescription,
    });
  }

  return rewrittenCount;
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
    wId: {
      describe:
        "Process skills for a single workspace (sId). Omit to run on all workspaces.",
      type: "string",
    },
  },
  async ({ concurrency, execute, fromWorkspaceId, wId }, logger) => {
    let totalCount = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const count = await rewriteWorkspaceOfficeSkillDirectives(
          workspace,
          { execute },
          logger
        );

        if (count > 0) {
          logger.info(
            { skills: count, workspaceId: workspace.sId },
            execute
              ? "Rewrote office skill directives for workspace"
              : "Would rewrite office skill directives for workspace"
          );
        }

        totalCount += count;
      },
      { concurrency, fromWorkspaceId, wId }
    );

    logger.info(
      { skills: totalCount, workspaceId: wId ?? "all" },
      execute
        ? `Rewrote the office skill directive on ${totalCount} skills`
        : `Would rewrite the office skill directive on ${totalCount} skills`
    );
  }
);
