import type { Authenticator } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
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

  let repaired = 0;
  let skipped = 0;

  for (const skillModel of skillModels) {
    const skill = await SkillResource.fetchByModelIdWithAuth(
      auth,
      skillModel.id
    );

    if (!skill) {
      skipped++;
      continue;
    }

    const {
      attachedKnowledge,
      requestedSpaceIds,
      shouldNormalizeUnavailableReferences,
    } = await computeBackfilledSkillState(auth, skill);

    const requestedSpaceIdsChanged = !hasSameSpaceIds(
      skill.requestedSpaceIds,
      requestedSpaceIds
    );
    if (!requestedSpaceIdsChanged && !shouldNormalizeUnavailableReferences) {
      skipped++;
      continue;
    }

    if (execute) {
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

    repaired++;
  }

  return {
    totalCandidates: skillModels.length,
    repaired,
    skipped,
  };
}

async function computeBackfilledSkillState(
  auth: Authenticator,
  skill: SkillResource
): Promise<{
  attachedKnowledge: SkillAttachedKnowledge[];
  requestedSpaceIds: ModelId[];
  shouldNormalizeUnavailableReferences: boolean;
}> {
  const attachedKnowledge = await skill.getAttachedKnowledge(auth);
  const skillReferences = extractSkillReferenceTags(skill.instructions);
  const referencedSkillIds = uniq(
    skillReferences
      .map((reference) => reference.id)
      .filter((skillId) => isResourceSId("skill", skillId))
  );
  const referencedSkills =
    referencedSkillIds.length > 0
      ? await SkillResource.fetchByIds(auth, referencedSkillIds)
      : [];

  const computedRequestedSpaceIds =
    await SkillResource.computeRequestedSpaceIds(auth, {
      mcpServerViews: skill.mcpServerViews,
      attachedKnowledge,
    });
  const referencedSkillSpaceIds = uniq(
    referencedSkills
      .filter(
        (referencedSkill) =>
          referencedSkill.status === "active" &&
          referencedSkill.sId !== skill.sId
      )
      .flatMap((referencedSkill) => referencedSkill.requestedSpaceIds)
  );
  const requestedSpaceIds = uniq([
    ...computedRequestedSpaceIds,
    ...referencedSkillSpaceIds,
    ...skill.requestedSpaceIds,
  ]);

  return {
    attachedKnowledge,
    requestedSpaceIds,
    shouldNormalizeUnavailableReferences:
      await canNormalizeUnavailableReferences(auth, {
        parentRequestedSpaceIds: requestedSpaceIds,
        referencedSkills,
        skillReferences,
      }),
  };
}

async function canNormalizeUnavailableReferences(
  auth: Authenticator,
  {
    parentRequestedSpaceIds,
    referencedSkills,
    skillReferences,
  }: {
    parentRequestedSpaceIds: readonly ModelId[];
    referencedSkills: SkillResource[];
    skillReferences: ReturnType<typeof extractSkillReferenceTags>;
  }
): Promise<boolean> {
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

  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  const parentRequestedSpaceIdSet = new Set([
    ...parentRequestedSpaceIds,
    globalSpace.id,
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
