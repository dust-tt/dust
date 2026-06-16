import { getReferencedSkillSpaceModelIds } from "@app/lib/api/skills/space_requirements";
import type { Authenticator } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import {
  type SkillAttachedKnowledge,
  SkillResource,
} from "@app/lib/resources/skill/skill_resource";
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

    const { attachedKnowledge, requestedSpaceIds } =
      await computeBackfilledSkillState(auth, skill);

    if (hasSameSpaceIds(skill.requestedSpaceIds, requestedSpaceIds)) {
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
}> {
  const attachedKnowledge = await skill.getAttachedKnowledge(auth);
  const [computedRequestedSpaceIds, referencedSkillSpaceIds] =
    await Promise.all([
      SkillResource.computeRequestedSpaceIds(auth, {
        mcpServerViews: skill.mcpServerViews,
        attachedKnowledge,
      }),
      getReferencedSkillSpaceModelIds(auth, skill.instructions, skill.sId),
    ]);

  return {
    attachedKnowledge,
    requestedSpaceIds: uniq([
      ...computedRequestedSpaceIds,
      ...referencedSkillSpaceIds,
      ...skill.requestedSpaceIds,
    ]),
  };
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
