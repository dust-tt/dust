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
  if (!execute) {
    const plan = await buildBackfillPlan(auth);

    return {
      totalCandidates: plan.candidateSkillModelIds.length,
      repaired: plan.repairPlans.length,
      skipped: plan.skippedSkillModelIds.length,
    };
  }

  const candidateSkillModelIds = new Set<ModelId>();
  const repairedSkillModelIds = new Set<ModelId>();
  const skippedSkillModelIds = new Set<ModelId>();
  let repaired = 0;

  for (let pass = 1; pass <= MAX_BACKFILL_PASSES; pass++) {
    const plan = await buildBackfillPlan(auth);

    for (const skillModelId of plan.candidateSkillModelIds) {
      candidateSkillModelIds.add(skillModelId);
    }
    for (const skillModelId of plan.skippedSkillModelIds) {
      skippedSkillModelIds.add(skillModelId);
    }

    if (plan.repairPlans.length === 0) {
      return {
        totalCandidates: candidateSkillModelIds.size,
        repaired,
        skipped: [...skippedSkillModelIds].filter(
          (skillModelId) => !repairedSkillModelIds.has(skillModelId)
        ).length,
      };
    }

    await executeRepairPlans(auth, plan.repairPlans);

    repaired += plan.repairPlans.length;
    for (const { skill } of plan.repairPlans) {
      repairedSkillModelIds.add(skill.id);
    }
  }

  throw new Error(
    `Unavailable skill reference backfill did not converge after ${MAX_BACKFILL_PASSES} passes.`
  );
}

async function buildBackfillPlan(auth: Authenticator): Promise<BackfillPlan> {
  const workspace = auth.getNonNullableWorkspace();
  const skillModels = await SkillConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      status: "active",
      // One-off backfill: the workspace/status index narrows the scan enough;
      // an instructions index is not warranted for this temporary script.
      instructions: { [Op.like]: "%<unavailable_skill%" },
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

  const repairPlans: BackfillRepairPlan[] = [];
  const skippedSkillModelIds: ModelId[] = [];

  for (const skillModel of skillModels) {
    const skill = skillsByModelId.get(skillModel.id);

    if (!skill) {
      skippedSkillModelIds.push(skillModel.id);
      continue;
    }

    const skillReferences = extractSkillReferenceTags(skill.instructions);
    const referencedSkills = referencedSkillsForSkill(
      skillReferences,
      referencedSkillsById
    );
    const requestedSpaceIds = computeBackfilledRequestedSpaceIds(
      skill,
      referencedSkills
    );
    const shouldNormalizeUnavailableReferences =
      canNormalizeUnavailableReferences({
        globalSpaceId: globalSpace.id,
        parentRequestedSpaceIds: requestedSpaceIds,
        referencedSkills,
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

function computeBackfilledRequestedSpaceIds(
  skill: SkillResource,
  referencedSkills: readonly SkillResource[]
): ModelId[] {
  const referencedSkillSpaceIds = uniq(
    referencedSkills
      .filter(
        (referencedSkill) =>
          referencedSkill.status === "active" &&
          referencedSkill.sId !== skill.sId
      )
      .flatMap((referencedSkill) => referencedSkill.requestedSpaceIds)
  );

  return uniq([...skill.requestedSpaceIds, ...referencedSkillSpaceIds]);
}

function canNormalizeUnavailableReferences({
  globalSpaceId,
  parentRequestedSpaceIds,
  referencedSkills,
  skillReferences,
}: {
  globalSpaceId: ModelId;
  parentRequestedSpaceIds: readonly ModelId[];
  referencedSkills: readonly SkillResource[];
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
      referencedSkill.requestedSpaceIds.every((spaceId) =>
        parentRequestedSpaceIdSet.has(spaceId)
      )
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
