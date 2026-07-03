import type { Authenticator } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { SkillReferenceModel } from "@app/lib/models/skill/skill_reference";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  getResourceIdFromSId,
  getResourceNameAndIdFromSId,
  isResourceSId,
} from "@app/lib/resources/string_ids";
import {
  extractUniqueSkillReferenceIds,
  parseSkillReferenceTag,
  renameSkillReferencesInContent,
  SKILL_REFERENCE_TAG_REGEX,
  serializeSkillTag,
  serializeUnavailableSkillTag,
} from "@app/lib/skills/format";
import type { SkillStatus } from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

type SkillReferenceTarget = {
  icon: string | null;
  id: string;
  name: string;
  requestedSpaceIds: readonly ModelId[];
  status: SkillStatus;
};

type ReplaceSkillReferenceTagsOptions = {
  html?: boolean;
};

function replaceSkillReferenceTags(
  content: string,
  targets: ReadonlyMap<string, SkillReferenceTarget>,
  parentRequestedSpaceIds: readonly ModelId[],
  { html = false }: ReplaceSkillReferenceTagsOptions = {}
): string {
  if (targets.size === 0) {
    return content;
  }

  const parentRequestedSpaceIdsSet = new Set(parentRequestedSpaceIds);

  return content.replace(SKILL_REFERENCE_TAG_REGEX, (tag) => {
    const skill = parseSkillReferenceTag(tag);
    const target = skill ? targets.get(skill.id) : undefined;

    if (!target) {
      return tag;
    }

    const isAvailable =
      target.status === "active" &&
      target.requestedSpaceIds.every((spaceId) =>
        parentRequestedSpaceIdsSet.has(spaceId)
      );

    if (!isAvailable) {
      return serializeUnavailableSkillTag({ id: target.id }, { html });
    }

    return serializeSkillTag(
      {
        icon: target.icon,
        id: target.id,
        name: target.name,
      },
      { html }
    );
  });
}

/**
 * Sync the denormalized skill_references rows with the inline skill reference
 * tags found in the instructions (the source of truth). Deriving from the
 * instructions keeps the table consistent on every write path, including
 * restoring a previous version whose references differ from the current ones.
 */
export async function syncSkillReferences(
  auth: Authenticator,
  skill: SkillResource,
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  // Self-references are intentionally kept (#26680 allows them).
  const referencedSkillIds = extractUniqueSkillReferenceIds(skill.instructions);

  // Retrieve what we want the end state to be.
  const referencedCustomSkillIds = uniq(
    removeNulls(
      referencedSkillIds.map((sId) => {
        const parsed = getResourceNameAndIdFromSId(sId);

        return parsed?.resourceName === "skill" &&
          parsed.workspaceModelId === workspace.id
          ? parsed.resourceModelId
          : null;
      })
    )
  );
  const referencedGlobalSkillIds = uniq(
    referencedSkillIds.filter((sId) => !getResourceNameAndIdFromSId(sId))
  );

  const childSkills = await SkillConfigurationModel.findAll({
    attributes: ["id"],
    where: {
      id: { [Op.in]: referencedCustomSkillIds },
      workspaceId: workspace.id,
    },
    transaction,
  });

  const desiredCustomSkillIds = new Set(
    childSkills.map((childSkill) => childSkill.id)
  );
  const desiredGlobalSkillIds = new Set(referencedGlobalSkillIds);

  // Retrieve the current state.
  const existingReferences = await SkillReferenceModel.findAll({
    where: {
      workspaceId: workspace.id,
      parentSkillId: skill.id,
    },
    transaction,
  });

  const existingCustomSkillIds = new Set(
    removeNulls(existingReferences.map((ref) => ref.childCustomSkillId))
  );
  const existingGlobalSkillIds = new Set(
    removeNulls(existingReferences.map((ref) => ref.childGlobalSkillId))
  );

  // Delete references that are in the current state but not the end state.
  const referencesToDelete = existingReferences.filter((ref) => {
    if (ref.childCustomSkillId !== null) {
      return !desiredCustomSkillIds.has(ref.childCustomSkillId);
    }

    if (ref.childGlobalSkillId !== null) {
      return !desiredGlobalSkillIds.has(ref.childGlobalSkillId);
    }

    return true;
  });

  if (referencesToDelete.length > 0) {
    await SkillReferenceModel.destroy({
      where: {
        id: { [Op.in]: referencesToDelete.map((ref) => ref.id) },
        workspaceId: workspace.id,
      },
      transaction,
    });
  }

  // Add references that are in the end state but not the current state.
  const referencesToCreate = [
    ...[...desiredCustomSkillIds]
      .filter((childSkillId) => !existingCustomSkillIds.has(childSkillId))
      .map((childSkillId) => ({
        workspaceId: workspace.id,
        parentSkillId: skill.id,
        childCustomSkillId: childSkillId,
        childGlobalSkillId: null,
      })),
    ...[...desiredGlobalSkillIds]
      .filter((globalSkillId) => !existingGlobalSkillIds.has(globalSkillId))
      .map((globalSkillId) => ({
        workspaceId: workspace.id,
        parentSkillId: skill.id,
        childCustomSkillId: null,
        childGlobalSkillId: globalSkillId,
      })),
  ];

  if (referencesToCreate.length > 0) {
    await SkillReferenceModel.bulkCreate(referencesToCreate, { transaction });
  }
}

/**
 * Rewrites inline references to this skill in every parent skill so their tag
 * availability reflects this skill's current status and requested spaces.
 */
export async function propagateReferenceUpdatesToParentSkills(
  auth: Authenticator,
  skill: SkillResource,
  {
    icon,
    name,
    requestedSpaceIds,
    status,
  }: {
    icon: string | null;
    name: string;
    requestedSpaceIds: readonly ModelId[];
    status: SkillStatus;
  },
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  const workspace = auth.getNonNullableWorkspace();

  const references = await SkillReferenceModel.findAll({
    where: {
      workspaceId: workspace.id,
      childCustomSkillId: skill.id,
    },
    transaction,
  });

  const referencingSkillIds = uniq(
    references.map((reference) => reference.parentSkillId)
  );

  if (referencingSkillIds.length === 0) {
    return;
  }

  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(
    auth,
    transaction
  );
  const target = new Map<string, SkillReferenceTarget>([
    [
      skill.sId,
      {
        icon,
        id: skill.sId,
        name,
        requestedSpaceIds,
        status,
      },
    ],
  ]);

  const referencingSkills = await SkillConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      id: referencingSkillIds,
    },
    transaction,
  });

  // Each update carries distinct instructions content so it cannot be
  // batched. Bounded by the number of skills referencing this one.
  for (const referencingSkill of referencingSkills) {
    const parentRequestedSpaceIds = uniq([
      ...referencingSkill.requestedSpaceIds,
      globalSpace.id,
    ]);
    const renamedInstructions = renameSkillReferencesInContent(
      referencingSkill.instructions,
      { skillId: skill.sId, newName: name }
    );
    const renamedInstructionsHtml =
      referencingSkill.instructionsHtml != null
        ? renameSkillReferencesInContent(referencingSkill.instructionsHtml, {
            skillId: skill.sId,
            newName: name,
          })
        : referencingSkill.instructionsHtml;
    const instructions = replaceSkillReferenceTags(
      renamedInstructions,
      target,
      parentRequestedSpaceIds
    );
    const instructionsHtml =
      renamedInstructionsHtml !== null
        ? replaceSkillReferenceTags(
            renamedInstructionsHtml,
            target,
            parentRequestedSpaceIds,
            { html: true }
          )
        : null;

    if (
      instructions === referencingSkill.instructions &&
      instructionsHtml === referencingSkill.instructionsHtml
    ) {
      continue;
    }

    await referencingSkill.update(
      { instructions, instructionsHtml },
      { transaction }
    );
  }
}

/**
 * Computes the normalized instructions of the skill: every inline skill
 * reference tag is rewritten to reflect the referenced skill's current name,
 * icon and availability. Returns `null` when the instructions are already
 * normalized. The caller is responsible for persisting the returned values.
 */
export async function computeNormalizedSkillReferenceTags(
  auth: Authenticator,
  skill: SkillResource,
  { transaction }: { transaction?: Transaction } = {}
): Promise<{ instructions: string; instructionsHtml: string | null } | null> {
  const workspace = auth.getNonNullableWorkspace();
  const customSkillIdByModelId = new Map<ModelId, string>(
    removeNulls(
      extractUniqueSkillReferenceIds(skill.instructions).map((skillId) => {
        const modelId = isResourceSId("skill", skillId)
          ? getResourceIdFromSId(skillId)
          : null;

        return modelId ? [modelId, skillId] : null;
      })
    )
  );

  if (customSkillIdByModelId.size === 0) {
    return null;
  }

  const customSkills = await SkillConfigurationModel.findAll({
    where: {
      id: [...customSkillIdByModelId.keys()],
      workspaceId: workspace.id,
    },
    attributes: ["id", "icon", "name", "requestedSpaceIds", "status"],
    transaction,
  });
  const targets = new Map<string, SkillReferenceTarget>(
    removeNulls(
      customSkills.map((customSkill) => {
        const sId = customSkillIdByModelId.get(customSkill.id);

        return sId
          ? [
              sId,
              {
                icon: customSkill.icon,
                id: sId,
                name: customSkill.name,
                requestedSpaceIds: customSkill.requestedSpaceIds,
                status: customSkill.status,
              },
            ]
          : null;
      })
    )
  );
  for (const skillId of customSkillIdByModelId.values()) {
    if (!targets.has(skillId)) {
      targets.set(skillId, {
        icon: null,
        id: skillId,
        name: "",
        requestedSpaceIds: [],
        status: "archived",
      });
    }
  }

  const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(
    auth,
    transaction
  );
  const parentRequestedSpaceIds = uniq([
    ...skill.requestedSpaceIds,
    globalSpace.id,
  ]);

  const instructions = replaceSkillReferenceTags(
    skill.instructions,
    targets,
    parentRequestedSpaceIds
  );
  const instructionsHtml =
    skill.instructionsHtml !== null
      ? replaceSkillReferenceTags(
          skill.instructionsHtml,
          targets,
          parentRequestedSpaceIds,
          { html: true }
        )
      : null;

  if (
    instructions !== skill.instructions ||
    instructionsHtml !== skill.instructionsHtml
  ) {
    return { instructions, instructionsHtml };
  }

  return null;
}
