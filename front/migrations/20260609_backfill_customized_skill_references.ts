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

type VersionUpdate = {
  id: number;
  instructions: string;
  instructionsHtml: string | null;
};

type SkillBackfillPlan = {
  skill: SkillConfigurationModel;
  extendedSkillId: string;
  instructions: string;
  instructionsHtml: string | null;
  shouldCreateReference: boolean;
  versionUpdates: VersionUpdate[];
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

async function fetchCustomizedSkills(
  workspace: LightWorkspaceType
): Promise<SkillConfigurationModel[]> {
  // This one-off backfill scopes by workspace and status to use
  // idx_skill_configuration_workspace_status; extendedSkillId is the residual filter.
  return SkillConfigurationModel.findAll({
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
}

async function fetchVersionRowsForSkills({
  skillIds,
  workspace,
}: {
  skillIds: number[];
  workspace: LightWorkspaceType;
}): Promise<SkillVersionModel[]> {
  // Bound by the current legacy skills found above; uses the skill_versions
  // (workspaceId, skillConfigurationId) index.
  const versionRowsWhere: WhereOptions<SkillVersionModel> = {
    workspaceId: workspace.id,
    skillConfigurationId: { [Op.in]: skillIds },
  };

  return SkillVersionModel.findAll({
    attributes: [
      "id",
      "skillConfigurationId",
      "instructions",
      "instructionsHtml",
      "extendedSkillId",
    ],
    where: versionRowsWhere,
  });
}

function indexVersionRowsBySkillId(
  versionRows: SkillVersionModel[]
): Map<number, SkillVersionModel[]> {
  const versionRowsBySkillId = new Map<number, SkillVersionModel[]>();

  for (const versionRow of versionRows) {
    const rows = versionRowsBySkillId.get(versionRow.skillConfigurationId);
    versionRowsBySkillId.set(versionRow.skillConfigurationId, [
      ...(rows ?? []),
      versionRow,
    ]);
  }

  return versionRowsBySkillId;
}

function getExtendedSkillIds({
  skills,
  versionRows,
}: {
  skills: SkillConfigurationModel[];
  versionRows: SkillVersionModel[];
}): string[] {
  return uniq(
    removeNulls([
      ...skills.map((s) => s.extendedSkillId),
      ...versionRows.map((v) => v.extendedSkillId),
    ])
  );
}

async function fetchBaseSkillById({
  auth,
  extendedSkillIds,
}: {
  auth: Authenticator;
  extendedSkillIds: string[];
}): Promise<Map<string, SkillResource>> {
  const baseSkills = await SkillResource.fetchByIds(auth, extendedSkillIds);

  return new Map(baseSkills.map((skill) => [skill.sId, skill]));
}

async function fetchExistingReferenceKeys({
  extendedSkillIds,
  skills,
  workspace,
}: {
  extendedSkillIds: string[];
  skills: SkillConfigurationModel[];
  workspace: LightWorkspaceType;
}): Promise<Set<string>> {
  const existingReferences = await SkillReferenceModel.findAll({
    attributes: ["parentSkillId", "childGlobalSkillId"],
    where: {
      workspaceId: workspace.id,
      parentSkillId: { [Op.in]: skills.map((skill) => skill.id) },
      childCustomSkillId: null,
      childGlobalSkillId: { [Op.in]: extendedSkillIds },
    },
  });

  return new Set(
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
}

function getExtendableBaseSkill({
  baseSkillById,
  extendedSkillId,
}: {
  baseSkillById: Map<string, SkillResource>;
  extendedSkillId: string;
}): SkillResource | null {
  const baseSkill = baseSkillById.get(extendedSkillId);

  if (!baseSkill || !baseSkill.isExtendable) {
    return null;
  }

  return baseSkill;
}

function logMissingBaseSkill({
  baseSkillId,
  logger,
  message,
  skill,
  workspace,
}: {
  baseSkillId: string;
  logger: Logger;
  message: string;
  skill: SkillConfigurationModel;
  workspace: LightWorkspaceType;
}): void {
  logger.error(
    {
      skillId: SkillResource.modelIdToSId({
        id: skill.id,
        workspaceId: workspace.id,
      }),
      baseSkillId,
      workspaceId: workspace.sId,
    },
    message
  );
}

function getVersionUpdates({
  baseSkillById,
  extendedSkillId,
  versionRows,
}: {
  baseSkillById: Map<string, SkillResource>;
  extendedSkillId: string;
  versionRows: SkillVersionModel[];
}):
  | {
      missingBaseSkillId: string;
      versionUpdates: null;
    }
  | {
      missingBaseSkillId: null;
      versionUpdates: VersionUpdate[];
    } {
  const versionUpdates: VersionUpdate[] = [];

  for (const versionRow of versionRows) {
    const versionExtendedSkillId =
      versionRow.extendedSkillId ?? extendedSkillId;
    const versionBaseSkill = getExtendableBaseSkill({
      baseSkillById,
      extendedSkillId: versionExtendedSkillId,
    });

    if (!versionBaseSkill) {
      return {
        missingBaseSkillId: versionExtendedSkillId,
        versionUpdates: null,
      };
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

  return {
    missingBaseSkillId: null,
    versionUpdates,
  };
}

function getSkillBackfillPlan({
  baseSkillById,
  existingReferenceKeys,
  logger,
  skill,
  versionRows,
  workspace,
}: {
  baseSkillById: Map<string, SkillResource>;
  existingReferenceKeys: Set<string>;
  logger: Logger;
  skill: SkillConfigurationModel;
  versionRows: SkillVersionModel[];
  workspace: LightWorkspaceType;
}): SkillBackfillPlan | null {
  const extendedSkillId = skill.extendedSkillId;

  if (extendedSkillId === null) {
    throw new Error("Expected customized skill to have an extendedSkillId.");
  }

  const baseSkill = getExtendableBaseSkill({
    baseSkillById,
    extendedSkillId,
  });

  if (!baseSkill) {
    logMissingBaseSkill({
      baseSkillId: extendedSkillId,
      logger,
      message: "Could not resolve extendable base skill for customized skill",
      skill,
      workspace,
    });

    return null;
  }

  const { instructions, instructionsHtml } = prependBaseSkillReference({
    baseSkill,
    instructions: skill.instructions,
    instructionsHtml: skill.instructionsHtml,
  });
  const { missingBaseSkillId, versionUpdates } = getVersionUpdates({
    baseSkillById,
    extendedSkillId,
    versionRows,
  });

  if (missingBaseSkillId !== null) {
    logMissingBaseSkill({
      baseSkillId: missingBaseSkillId,
      logger,
      message:
        "Could not resolve extendable base skill for customized skill version",
      skill,
      workspace,
    });

    return null;
  }

  const referenceKey = getGlobalReferenceKey({
    parentSkillId: skill.id,
    childGlobalSkillId: extendedSkillId,
  });

  return {
    skill,
    extendedSkillId,
    instructions,
    instructionsHtml,
    shouldCreateReference: !existingReferenceKeys.has(referenceKey),
    versionUpdates,
  };
}

async function executeSkillBackfillPlan({
  plan,
  workspace,
}: {
  plan: SkillBackfillPlan;
  workspace: LightWorkspaceType;
}): Promise<void> {
  await withTransaction(async (transaction) => {
    await SkillConfigurationModel.update(
      {
        instructions: plan.instructions,
        instructionsHtml: plan.instructionsHtml,
        extendedSkillId: null,
      },
      {
        hooks: false,
        silent: true,
        transaction,
        where: {
          id: plan.skill.id,
          workspaceId: workspace.id,
        },
      }
    );

    if (plan.shouldCreateReference) {
      await SkillReferenceModel.create(
        {
          workspaceId: workspace.id,
          parentSkillId: plan.skill.id,
          childCustomSkillId: null,
          childGlobalSkillId: plan.extendedSkillId,
        },
        { transaction }
      );
    }

    for (const versionUpdate of plan.versionUpdates) {
      const versionWhere: WhereOptions<SkillVersionModel> = {
        id: versionUpdate.id,
        skillConfigurationId: plan.skill.id,
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
  const skills = await fetchCustomizedSkills(workspace);

  const stats: CustomizedSkillReferencesBackfillStats = {
    changed: 0,
    errors: 0,
    processed: skills.length,
  };

  if (skills.length === 0) {
    return stats;
  }

  const versionRows = await fetchVersionRowsForSkills({
    skillIds: skills.map((skill) => skill.id),
    workspace,
  });
  const versionRowsBySkillId = indexVersionRowsBySkillId(versionRows);
  const extendedSkillIds = getExtendedSkillIds({ skills, versionRows });
  const baseSkillById = await fetchBaseSkillById({
    auth,
    extendedSkillIds,
  });
  const existingReferenceKeys = await fetchExistingReferenceKeys({
    extendedSkillIds,
    skills,
    workspace,
  });

  for (const skill of skills) {
    const plan = getSkillBackfillPlan({
      baseSkillById,
      existingReferenceKeys,
      logger,
      skill,
      versionRows: versionRowsBySkillId.get(skill.id) ?? [],
      workspace,
    });

    if (plan === null) {
      stats.errors++;
      continue;
    }

    stats.changed++;
    logger.info(
      {
        execute,
        skillId: SkillResource.modelIdToSId({
          id: plan.skill.id,
          workspaceId: workspace.id,
        }),
        skillName: plan.skill.name,
        baseSkillId: plan.extendedSkillId,
        versionRows: plan.versionUpdates.length,
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
      await executeSkillBackfillPlan({
        plan,
        workspace,
      });
    } catch (error) {
      stats.errors++;
      logger.error(
        {
          error,
          skillId: SkillResource.modelIdToSId({
            id: plan.skill.id,
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
