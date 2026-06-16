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

export type BackfillUnavailableSkillReferencesStats = {
  totalCandidates: number;
  repaired: number;
  skipped: number;
};

type BackfillRepairPlan = {
  skill: SkillResource;
  requestedSpaceIds: ModelId[];
};

export async function backfillUnavailableSkillReferencesForWorkspace(
  auth: Authenticator,
  { execute }: { execute: boolean }
): Promise<BackfillUnavailableSkillReferencesStats> {
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
      totalCandidates: 0,
      repaired: 0,
      skipped: 0,
    };
  }

  const skills = await SkillResource.fetchByModelIds(
    auth,
    skillModels.map((skillModel) => skillModel.id)
  );
  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
  const referencedSkillsBySId = await fetchReferencedSkillsBySId(auth, skills);
  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

  const repairPlans: BackfillRepairPlan[] = [];
  let skipped = 0;

  for (const skillModel of skillModels) {
    const skill = skillsById.get(skillModel.id);

    if (!skill) {
      skipped++;
      continue;
    }

    const skillReferences = extractSkillReferenceTags(skill.instructions);
    const referencedSkills = referencedSkillsForSkill(
      skillReferences,
      referencedSkillsBySId
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
      skipped++;
      continue;
    }

    repairPlans.push({
      skill,
      requestedSpaceIds,
    });
  }

  if (execute) {
    const attachedKnowledgeBySkillId = await fetchAttachedKnowledgeBySkillId(
      auth,
      repairPlans.map((plan) => plan.skill)
    );

    for (const { skill, requestedSpaceIds } of repairPlans) {
      const attachedKnowledge = attachedKnowledgeBySkillId.get(skill.id);
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

  return {
    totalCandidates: skillModels.length,
    repaired: repairPlans.length,
    skipped,
  };
}

async function fetchReferencedSkillsBySId(
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

async function fetchAttachedKnowledgeBySkillId(
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
  const dataSourceViewsById = new Map(
    dataSourceViews.map((view) => [view.id, view])
  );
  const attachedKnowledgeBySkillId = new Map<
    ModelId,
    SkillAttachedKnowledge[]
  >();

  for (const skill of skills) {
    const attachedKnowledge: SkillAttachedKnowledge[] = [];

    for (const config of skill.dataSourceConfigurations) {
      const dataSourceView = dataSourceViewsById.get(config.dataSourceViewId);

      if (dataSourceView) {
        for (const nodeId of config.parentsIn) {
          attachedKnowledge.push({
            dataSourceView,
            nodeId,
          });
        }
      }
    }

    attachedKnowledgeBySkillId.set(skill.id, attachedKnowledge);
  }

  return attachedKnowledgeBySkillId;
}

function referencedSkillsForSkill(
  skillReferences: ReturnType<typeof extractSkillReferenceTags>,
  referencedSkillsBySId: ReadonlyMap<string, SkillResource>
): SkillResource[] {
  const referencedSkillIds = uniq(
    skillReferences
      .map((reference) => reference.id)
      .filter((skillId) => isResourceSId("skill", skillId))
  );
  const referencedSkills: SkillResource[] = [];

  for (const skillId of referencedSkillIds) {
    const referencedSkill = referencedSkillsBySId.get(skillId);

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
