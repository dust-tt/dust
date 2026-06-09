import { generateShortBlockId } from "@app/lib/generate_short_block_id";
import { Authenticator } from "@app/lib/auth";
import {
  SkillConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import { SkillReferenceModel } from "@app/lib/models/skill/skill_reference";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  extractUniqueSkillReferenceIds,
  serializeSkillTag,
} from "@app/lib/skills/format";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { SkillStatus } from "@app/types/assistant/skill_configuration";
import { removeNulls } from "@app/types/shared/utils/general";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import * as cheerio from "cheerio";
import uniq from "lodash/uniq";
import type { Logger } from "pino";
import { Op, type WhereOptions } from "sequelize";

const CUSTOMIZED_SKILL_LABEL = "This skill is a customization of";
const CUSTOMIZED_SKILL_SEPARATOR = "---";
const CUSTOMIZED_SKILL_STATUSES: SkillStatus[] = [
  "active",
  "archived",
  "suggested",
];

type BaseSkill = {
  sId: string;
  icon: string | null;
  name: string;
};

type CustomizedSkillReferencesBackfillStats = {
  changed: number;
  errors: number;
  processed: number;
};

function hasSkillReference(content: string, skillId: string): boolean {
  return extractUniqueSkillReferenceIds(content).includes(skillId);
}

function prependHtmlReference({
  baseSkill,
  instructionsHtml,
}: {
  baseSkill: BaseSkill;
  instructionsHtml: string;
}): string {
  const renderedSkill = serializeSkillTag(
    {
      id: baseSkill.sId,
      icon: baseSkill.icon,
      name: baseSkill.name,
    },
    { html: true }
  );
  const paragraph = `<p data-block-id="${generateShortBlockId()}">${CUSTOMIZED_SKILL_LABEL} ${renderedSkill}</p>`;
  const separator = `<p data-block-id="${generateShortBlockId()}">${CUSTOMIZED_SKILL_SEPARATOR}</p>`;
  const $ = cheerio.load(instructionsHtml, { xmlMode: false }, false);
  const root = $(
    `[data-block-id="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"]`
  ).first();

  if (root.length > 0) {
    root.prepend(`${paragraph}${separator}`);
    return $.html();
  }

  return `${paragraph}\n${separator}\n${instructionsHtml}`;
}

function prependBaseSkillReference({
  baseSkill,
  instructions,
  instructionsHtml,
}: {
  baseSkill: BaseSkill;
  instructions: string;
  instructionsHtml: string | null;
}): {
  instructions: string;
  instructionsHtml: string | null;
} {
  const renderedSkill = serializeSkillTag({
    id: baseSkill.sId,
    icon: baseSkill.icon,
    name: baseSkill.name,
  });

  return {
    instructions: hasSkillReference(instructions, baseSkill.sId)
      ? instructions
      : `${CUSTOMIZED_SKILL_LABEL} ${renderedSkill}\n${CUSTOMIZED_SKILL_SEPARATOR}\n${instructions}`,
    instructionsHtml:
      instructionsHtml !== null &&
      !hasSkillReference(instructionsHtml, baseSkill.sId)
        ? prependHtmlReference({ baseSkill, instructionsHtml })
        : instructionsHtml,
  };
}

function getGlobalReferenceKey({
  childGlobalSkillId,
  parentSkillId,
}: {
  childGlobalSkillId: string;
  parentSkillId: number;
}): string {
  return `${parentSkillId}:${childGlobalSkillId}`;
}

async function backfillCustomizedSkillReferencesForWorkspace(
  workspace: LightWorkspaceType,
  {
    execute,
  }: {
    execute: boolean;
  },
  logger: Logger
): Promise<CustomizedSkillReferencesBackfillStats> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // This one-off backfill scopes by workspace and status to use
  // idx_skill_configuration_workspace_status; extendedSkillId is the residual filter.
  const skills = await SkillConfigurationModel.findAll({
    attributes: [
      "id",
      "workspaceId",
      "name",
      "instructions",
      "instructionsHtml",
      "extendedSkillId",
    ],
    where: {
      workspaceId: workspace.id,
      status: { [Op.in]: CUSTOMIZED_SKILL_STATUSES },
      extendedSkillId: { [Op.ne]: null },
    },
  });

  const stats: CustomizedSkillReferencesBackfillStats = {
    changed: 0,
    errors: 0,
    processed: skills.length,
  };

  if (skills.length === 0) {
    return stats;
  }

  // Bound by the current legacy skills found above; uses the skill_versions
  // (workspaceId, skillConfigurationId) index.
  const versionRowsWhere: WhereOptions<SkillVersionModel> = {
    workspaceId: workspace.id,
    skillConfigurationId: { [Op.in]: skills.map((skill) => skill.id) },
  };
  const versionRows = await SkillVersionModel.findAll({
    attributes: [
      "id",
      "skillConfigurationId",
      "instructions",
      "instructionsHtml",
      "extendedSkillId",
    ],
    where: versionRowsWhere,
  });
  const versionRowsBySkillId = new Map<number, SkillVersionModel[]>();
  for (const versionRow of versionRows) {
    const rows =
      versionRowsBySkillId.get(versionRow.skillConfigurationId) ?? [];
    rows.push(versionRow);
    versionRowsBySkillId.set(versionRow.skillConfigurationId, rows);
  }

  const extendedSkillIds = uniq(
    removeNulls([
      ...skills.map((s) => s.extendedSkillId),
      ...versionRows.map((v) => v.extendedSkillId),
    ])
  );
  const baseSkills = await SkillResource.fetchByIds(auth, extendedSkillIds);
  const baseSkillById = new Map(baseSkills.map((skill) => [skill.sId, skill]));

  const existingReferences = await SkillReferenceModel.findAll({
    attributes: ["parentSkillId", "childGlobalSkillId"],
    where: {
      workspaceId: workspace.id,
      parentSkillId: { [Op.in]: skills.map((skill) => skill.id) },
      childCustomSkillId: null,
      childGlobalSkillId: { [Op.in]: extendedSkillIds },
    },
  });
  const existingReferenceKeys = new Set(
    removeNulls(
      existingReferences.map((ref) =>
        ref.childGlobalSkillId
          ? getGlobalReferenceKey({
              parentSkillId: ref.parentSkillId,
              childGlobalSkillId: ref.childGlobalSkillId,
            })
          : null
      )
    )
  );

  for (const skill of skills) {
    const extendedSkillId = skill.extendedSkillId;
    if (extendedSkillId === null) {
      throw new Error("Expected customized skill to have an extendedSkillId.");
    }

    const baseSkill = baseSkillById.get(extendedSkillId);
    if (!baseSkill || !baseSkill.isExtendable) {
      stats.errors++;
      logger.error(
        {
          skillId: SkillResource.modelIdToSId({
            id: skill.id,
            workspaceId: workspace.id,
          }),
          baseSkillId: extendedSkillId,
          workspaceId: workspace.sId,
        },
        "Could not resolve extendable base skill for customized skill"
      );
      continue;
    }

    const { instructions, instructionsHtml } = prependBaseSkillReference({
      baseSkill,
      instructions: skill.instructions,
      instructionsHtml: skill.instructionsHtml,
    });
    const versionRowsForSkill = versionRowsBySkillId.get(skill.id) ?? [];
    const versionUpdates: {
      id: number;
      instructions: string;
      instructionsHtml: string | null;
    }[] = [];
    let missingVersionBaseSkillId: string | null = null;

    for (const versionRow of versionRowsForSkill) {
      const versionExtendedSkillId =
        versionRow.extendedSkillId ?? extendedSkillId;

      const versionBaseSkill = baseSkillById.get(versionExtendedSkillId);
      if (!versionBaseSkill || !versionBaseSkill.isExtendable) {
        missingVersionBaseSkillId = versionExtendedSkillId;
        break;
      }

      versionUpdates.push({
        id: versionRow.id,
        ...prependBaseSkillReference({
          baseSkill: versionBaseSkill,
          instructions: versionRow.instructions,
          instructionsHtml: versionRow.instructionsHtml,
        }),
      });
    }

    if (missingVersionBaseSkillId !== null) {
      stats.errors++;
      logger.error(
        {
          skillId: SkillResource.modelIdToSId({
            id: skill.id,
            workspaceId: workspace.id,
          }),
          baseSkillId: missingVersionBaseSkillId,
          workspaceId: workspace.sId,
        },
        "Could not resolve extendable base skill for customized skill version"
      );
      continue;
    }

    const referenceKey = getGlobalReferenceKey({
      parentSkillId: skill.id,
      childGlobalSkillId: extendedSkillId,
    });
    const shouldCreateReference = !existingReferenceKeys.has(referenceKey);

    stats.changed++;
    logger.info(
      {
        execute,
        skillId: SkillResource.modelIdToSId({
          id: skill.id,
          workspaceId: workspace.id,
        }),
        skillName: skill.name,
        baseSkillId: extendedSkillId,
        versionRows: versionUpdates.length,
        workspaceId: workspace.sId,
      },
      execute
        ? "Backfilling customized skill reference"
        : "Would backfill customized skill reference"
    );

    if (!execute) {
      continue;
    }

    try {
      await withTransaction(async (transaction) => {
        await SkillConfigurationModel.update(
          {
            instructions,
            instructionsHtml,
            extendedSkillId: null,
          },
          {
            hooks: false,
            silent: true,
            transaction,
            where: {
              id: skill.id,
              workspaceId: workspace.id,
            },
          }
        );

        if (shouldCreateReference) {
          await SkillReferenceModel.create(
            {
              workspaceId: workspace.id,
              parentSkillId: skill.id,
              childCustomSkillId: null,
              childGlobalSkillId: extendedSkillId,
            },
            { transaction }
          );
        }

        for (const versionUpdate of versionUpdates) {
          const versionWhere: WhereOptions<SkillVersionModel> = {
            id: versionUpdate.id,
            skillConfigurationId: skill.id,
            workspaceId: workspace.id,
          };
          await SkillVersionModel.update(
            {
              instructions: versionUpdate.instructions,
              instructionsHtml: versionUpdate.instructionsHtml,
              extendedSkillId: null,
            },
            {
              hooks: false,
              silent: true,
              transaction,
              where: versionWhere,
            }
          );
        }
      });
    } catch (error) {
      stats.errors++;
      logger.error(
        {
          error,
          skillId: SkillResource.modelIdToSId({
            id: skill.id,
            workspaceId: workspace.id,
          }),
          workspaceId: workspace.sId,
        },
        "Failed to backfill customized skill reference"
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

    if (execute && totals.errors > 0) {
      throw new Error(
        `Customized skill references backfill completed with ${totals.errors} errors.`
      );
    }
  }
);
