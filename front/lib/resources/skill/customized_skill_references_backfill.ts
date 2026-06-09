import { Authenticator } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { SkillReferenceModel } from "@app/lib/models/skill/skill_reference";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { prependBaseSkillReference } from "@app/lib/skills/customization";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { SkillStatus } from "@app/types/assistant/skill_configuration";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import uniq from "lodash/uniq";
import type { Logger } from "pino";
import { Op } from "sequelize";

const CUSTOMIZED_SKILL_STATUSES: SkillStatus[] = [
  "active",
  "archived",
  "suggested",
];

export type CustomizedSkillReferencesBackfillStats = {
  changed: number;
  errors: number;
  processed: number;
};

function getGlobalReferenceKey({
  childGlobalSkillId,
  parentSkillId,
}: {
  childGlobalSkillId: string;
  parentSkillId: number;
}): string {
  return `${parentSkillId}:${childGlobalSkillId}`;
}

export async function backfillCustomizedSkillReferencesForWorkspace(
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

  const extendedSkillIds = uniq(
    removeNulls(skills.map((s) => s.extendedSkillId))
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
