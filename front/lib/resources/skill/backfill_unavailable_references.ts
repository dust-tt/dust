import type { Authenticator } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import {
  type SkillAttachedKnowledge,
  SkillResource,
} from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { extractSkillReferenceTags } from "@app/lib/skills/format";
import type { ModelId } from "@app/types/shared/model_id";
import uniq from "lodash/uniq";
import { Op } from "sequelize";

const MAX_BACKFILL_PASSES = 20;

export type BackfillUnavailableSkillReferencesStats = {
  totalCandidates: number;
  repaired: number;
  skipped: number;
};

type BackfillRepairPlan = {
  skill: SkillResource;
  requestedSpaceIds: ModelId[];
};

type BackfillPlan = {
  candidateSkillModelIds: ModelId[];
  repairPlans: BackfillRepairPlan[];
  skippedSkillModelIds: ModelId[];
};

export async function backfillUnavailableSkillReferencesForWorkspace(
  auth: Authenticator,
  { execute }: { execute: boolean }
): Promise<BackfillUnavailableSkillReferencesStats> {
  const plan = await buildBackfillPlan(auth);

  if (execute) {
    await executeRepairPlans(auth, plan.repairPlans);
  }

  return {
    totalCandidates: plan.candidateSkillModelIds.length,
    repaired: plan.repairPlans.length,
    skipped: plan.skippedSkillModelIds.length,
  };
}

async function buildBackfillPlan(auth: Authenticator): Promise<BackfillPlan> {
  const workspace = auth.getNonNullableWorkspace();
  const skillModels = await SkillConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      status: "active",
      // One-off backfill: the workspace/status index narrows the scan enough;
      // an instructions index is not warranted for this temporary script.
      [Op.or]: [
        { instructions: { [Op.like]: "%<skill%" } },
        { instructions: { [Op.like]: "%<unavailable_skill%" } },
      ],
    },
    attributes: ["id"],
    order: [["id", "ASC"]],
  });

  if (skillModels.length === 0) {
    return {
      candidateSkillModelIds: [],
      repairPlans: [],
      skippedSkillModelIds: [],
    };
  }

  const skills = await SkillResource.fetchByModelIds(
    auth,
    skillModels.map((skillModel) => skillModel.id)
  );
  const skillsByModelId = new Map(skills.map((skill) => [skill.id, skill]));
  const referencedSkillsById = await fetchReferencedSkillsById(auth, skills);
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  const skillReferencesBySkillModelId = new Map(
    skills.map((skill) => [
      skill.id,
      extractSkillReferenceTags(skill.instructions),
    ])
  );
  const requestedSpaceIdsBySkillModelId =
    computeBackfilledRequestedSpaceIdsBySkillModelId({
      referencedSkillsById,
      skillReferencesBySkillModelId,
      skills,
    });

  const repairPlans: BackfillRepairPlan[] = [];
  const skippedSkillModelIds: ModelId[] = [];

  for (const skillModel of skillModels) {
    const skill = skillsByModelId.get(skillModel.id);

    if (!skill) {
      skippedSkillModelIds.push(skillModel.id);
      continue;
    }

    const skillReferences = getSkillReferences(
      skillReferencesBySkillModelId,
      skill
    );
    const referencedSkills = referencedSkillsForSkill(
      skillReferences,
      referencedSkillsById
    );
    const requestedSpaceIds = getRequestedSpaceIds(
      requestedSpaceIdsBySkillModelId,
      skill
    );
    const shouldNormalizeUnavailableReferences =
      canNormalizeUnavailableReferences({
        globalSpaceId: globalSpace.id,
        parentRequestedSpaceIds: requestedSpaceIds,
        referencedSkills,
        requestedSpaceIdsBySkillModelId,
        skillReferences,
      });

    const requestedSpaceIdsChanged = !hasSameSpaceIds(
      skill.requestedSpaceIds,
      requestedSpaceIds
    );
    if (!requestedSpaceIdsChanged && !shouldNormalizeUnavailableReferences) {
      skippedSkillModelIds.push(skillModel.id);
      continue;
    }

    repairPlans.push({
      skill,
      requestedSpaceIds,
    });
  }

  return {
    candidateSkillModelIds: skillModels.map((skillModel) => skillModel.id),
    repairPlans,
    skippedSkillModelIds,
  };
}

async function executeRepairPlans(
  auth: Authenticator,
  repairPlans: BackfillRepairPlan[]
): Promise<void> {
  const attachedKnowledgeBySkillModelId =
    await fetchAttachedKnowledgeBySkillModelId(
      auth,
      repairPlans.map((plan) => plan.skill)
    );

  for (const { skill, requestedSpaceIds } of repairPlans) {
    const attachedKnowledge = attachedKnowledgeBySkillModelId.get(skill.id);
    if (!attachedKnowledge) {
      throw new Error(`Missing attached knowledge for skill ${skill.sId}.`);
    }

    await skill.updateSkill(auth, {
      name: skill.name,
      agentFacingDescription: skill.agentFacingDescription,
      userFacingDescription: skill.userFacingDescription,
      instructions: skill.instructions,
      instructionsHtml: skill.instructionsHtml,
      icon: skill.icon,
      mcpServerViews: skill.mcpServerViews,
      attachedKnowledge,
      requestedSpaceIds,
    });
  }
}

async function fetchReferencedSkillsById(
  auth: Authenticator,
  skills: readonly SkillResource[]
): Promise<Map<string, SkillResource>> {
  const referencedSkillIds = uniq(
    skills.flatMap((skill) =>
      extractSkillReferenceTags(skill.instructions)
        .map((reference) => reference.id)
        .filter((skillId) => isResourceSId("skill", skillId))
    )
  );

  const referencedSkills =
    referencedSkillIds.length > 0
      ? await SkillResource.fetchByIds(auth, referencedSkillIds)
      : [];

  return new Map(referencedSkills.map((skill) => [skill.sId, skill]));
}

async function fetchAttachedKnowledgeBySkillModelId(
  auth: Authenticator,
  skills: readonly SkillResource[]
): Promise<Map<ModelId, SkillAttachedKnowledge[]>> {
  const dataSourceViewIds = uniq(
    skills.flatMap((skill) =>
      skill.dataSourceConfigurations.map((config) => config.dataSourceViewId)
    )
  );
  const dataSourceViews =
    dataSourceViewIds.length > 0
      ? await DataSourceViewResource.fetchByModelIds(auth, dataSourceViewIds)
      : [];
  const dataSourceViewsByModelId = new Map(
    dataSourceViews.map((view) => [view.id, view])
  );
  const attachedKnowledgeBySkillModelId = new Map<
    ModelId,
    SkillAttachedKnowledge[]
  >();

  for (const skill of skills) {
    const attachedKnowledge: SkillAttachedKnowledge[] = [];

    for (const config of skill.dataSourceConfigurations) {
      const dataSourceView = dataSourceViewsByModelId.get(
        config.dataSourceViewId
      );

      if (dataSourceView) {
        for (const nodeId of config.parentsIn) {
          attachedKnowledge.push({
            dataSourceView,
            nodeId,
          });
        }
      }
    }

    attachedKnowledgeBySkillModelId.set(skill.id, attachedKnowledge);
  }

  return attachedKnowledgeBySkillModelId;
}

function referencedSkillsForSkill(
  skillReferences: ReturnType<typeof extractSkillReferenceTags>,
  referencedSkillsById: ReadonlyMap<string, SkillResource>
): SkillResource[] {
  const referencedSkillIds = uniq(
    skillReferences
      .map((reference) => reference.id)
      .filter((skillId) => isResourceSId("skill", skillId))
  );
  const referencedSkills: SkillResource[] = [];

  for (const skillId of referencedSkillIds) {
    const referencedSkill = referencedSkillsById.get(skillId);

    if (referencedSkill) {
      referencedSkills.push(referencedSkill);
    }
  }

  return referencedSkills;
}

function computeBackfilledRequestedSpaceIdsBySkillModelId({
  referencedSkillsById,
  skillReferencesBySkillModelId,
  skills,
}: {
  referencedSkillsById: ReadonlyMap<string, SkillResource>;
  skillReferencesBySkillModelId: ReadonlyMap<
    ModelId,
    ReturnType<typeof extractSkillReferenceTags>
  >;
  skills: readonly SkillResource[];
}): Map<ModelId, ModelId[]> {
  const requestedSpaceIdsBySkillModelId = new Map(
    skills.map((skill) => [skill.id, skill.requestedSpaceIds])
  );

  for (let pass = 1; pass <= MAX_BACKFILL_PASSES; pass++) {
    let changed = false;

    for (const skill of skills) {
      const skillReferences = getSkillReferences(
        skillReferencesBySkillModelId,
        skill
      );
      const referencedSkills = referencedSkillsForSkill(
        skillReferences,
        referencedSkillsById
      );
      const requestedSpaceIds = getRequestedSpaceIds(
        requestedSpaceIdsBySkillModelId,
        skill
      );
      const referencedSkillSpaceIds = referencedSkills
        .filter(
          (referencedSkill) =>
            referencedSkill.status === "active" &&
            referencedSkill.sId !== skill.sId
        )
        .flatMap((referencedSkill) =>
          getRequestedSpaceIds(requestedSpaceIdsBySkillModelId, referencedSkill)
        );
      const backfilledRequestedSpaceIds = uniq([
        ...requestedSpaceIds,
        ...referencedSkillSpaceIds,
      ]);

      if (!hasSameSpaceIds(requestedSpaceIds, backfilledRequestedSpaceIds)) {
        requestedSpaceIdsBySkillModelId.set(
          skill.id,
          backfilledRequestedSpaceIds
        );
        changed = true;
      }
    }

    if (!changed) {
      return requestedSpaceIdsBySkillModelId;
    }
  }

  throw new Error(
    `Unavailable skill reference backfill did not converge after ${MAX_BACKFILL_PASSES} passes.`
  );
}

function getSkillReferences(
  skillReferencesBySkillModelId: ReadonlyMap<
    ModelId,
    ReturnType<typeof extractSkillReferenceTags>
  >,
  skill: SkillResource
): ReturnType<typeof extractSkillReferenceTags> {
  const skillReferences = skillReferencesBySkillModelId.get(skill.id);

  if (!skillReferences) {
    throw new Error(`Missing skill references for skill ${skill.sId}.`);
  }

  return skillReferences;
}

function getRequestedSpaceIds(
  requestedSpaceIdsBySkillModelId: ReadonlyMap<ModelId, ModelId[]>,
  skill: SkillResource
): ModelId[] {
  return (
    requestedSpaceIdsBySkillModelId.get(skill.id) ?? skill.requestedSpaceIds
  );
}

function canNormalizeUnavailableReferences({
  globalSpaceId,
  parentRequestedSpaceIds,
  referencedSkills,
  requestedSpaceIdsBySkillModelId,
  skillReferences,
}: {
  globalSpaceId: ModelId;
  parentRequestedSpaceIds: readonly ModelId[];
  referencedSkills: readonly SkillResource[];
  requestedSpaceIdsBySkillModelId: ReadonlyMap<ModelId, ModelId[]>;
  skillReferences: ReturnType<typeof extractSkillReferenceTags>;
}): boolean {
  const unavailableSkillIds = new Set(
    skillReferences
      .filter(
        (reference) =>
          reference.unavailable && isResourceSId("skill", reference.id)
      )
      .map((reference) => reference.id)
  );

  if (unavailableSkillIds.size === 0) {
    return false;
  }

  const parentRequestedSpaceIdSet = new Set([
    ...parentRequestedSpaceIds,
    globalSpaceId,
  ]);

  return referencedSkills.some(
    (referencedSkill) =>
      unavailableSkillIds.has(referencedSkill.sId) &&
      referencedSkill.status === "active" &&
      getRequestedSpaceIds(
        requestedSpaceIdsBySkillModelId,
        referencedSkill
      ).every((spaceId) => parentRequestedSpaceIdSet.has(spaceId))
  );
}

function hasSameSpaceIds(
  left: readonly ModelId[],
  right: readonly ModelId[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSet = new Set(left);

  return right.every((id) => leftSet.has(id));
}
